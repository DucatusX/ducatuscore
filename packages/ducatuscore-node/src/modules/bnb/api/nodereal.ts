import request from 'request';
import Web3 from 'web3';
import logger from '../../../logger';
import { exponentialBackoff } from '../../../utils/retry';

// A record of nr_getTransactionByAddress / nr_getAssetTransfers.
// https://docs.nodereal.io/reference/nr_gettransactionbyaddress
export interface NodeRealTransfer {
  category: string; // 'external' | '20' | '721' | '1155'
  blockNum: string; // hex
  from: string;
  to: string;
  value: string; // hex, raw units
  asset?: string | null;
  hash: string;
  contractAddress?: string | null;
  decimal?: string | null;
  blockTimeStamp: number; // seconds
  gasPrice?: number;
  gasUsed?: number;
  receiptsStatus?: number; // 1 success, 0 failed
  logIndex?: number;
  traceIndex?: number;
}

// Same shape as EVMListTransactionsStream emits from Mongo, which is what DWS parses.
export interface WalletTransaction {
  txid: string;
  fee?: string; // wei, exact decimal string
  category: 'send' | 'receive' | 'move';
  satoshis: string; // wei, exact decimal string, negative for 'send'
  height: number;
  from: string;
  initialFrom: string;
  gasPrice?: number;
  receipt?: { status: boolean; gasUsed?: number };
  address: string;
  blockTime: Date;
  abiType?: { type: string; name: string; params: Array<{ name: string; value: string; type: string }> };
  internal: [];
  calls: [];
  network: string;
  chain: string;
  data: string;
}

const PAGE_SIZE = 1000; // max maxCount
const MAX_PAGES = 20;
const CACHE_TTL_MS = 30 * 1000;
const MAX_CONCURRENT = 2;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 10 * 1000;

// The API key is part of the endpoint URL, and web3 puts that URL into its connection errors
// ("CONNECTION ERROR: Couldn't connect to node https://bsc-mainnet.nodereal.io/v1/<key>").
export const redactApiKeys = (text: string) => String(text).replace(/(nodereal\.io\/(?:ws\/)?v1\/)[A-Za-z0-9_-]+/gi, '$1***');

export const hexToBigInt = (hex?: string | null) => (hex && hex !== '0x' ? BigInt(hex) : BigInt(0));

// Subclassing Error breaks instanceof with the es5 target, so retryable errors are flagged instead.
const retryable = (message: string) => Object.assign(new Error(message), { retryable: true });

export class NodeRealClient {
  private cache = new Map<string, { expires: number; transfers: Promise<NodeRealTransfer[]> }>();
  private active = 0;
  private queue: Array<() => void> = [];
  private web3s: { [url: string]: Web3 } = {};
  private keyIndex = 0;

  // `apiKeys`: comma-separated, overrides the environment (used by tests).
  constructor(private apiKeys?: string) {}

  // NODEREAL_API_KEYS (comma-separated, one or more) takes precedence over the single NODEREAL_API_KEY.
  keys(): string[] {
    const raw = this.apiKeys || process.env.NODEREAL_API_KEYS || process.env.NODEREAL_API_KEY || '';
    return raw
      .split(',')
      .map(key => key.trim())
      .filter(Boolean);
  }

  // Every call takes the next key in order (round-robin), so the requests are spread over all keys.
  url(network: string) {
    const keys = this.keys();
    if (!keys.length) {
      throw new Error('Neither NODEREAL_API_KEYS nor NODEREAL_API_KEY is set');
    }
    const index = this.keyIndex % keys.length;
    this.keyIndex = index + 1;
    return `https://bsc-${network === 'mainnet' ? 'mainnet' : 'testnet'}.nodereal.io/v1/${keys[index]}`;
  }

  /**
   * Native and BEP20 transfers of an address in both directions, newest first.
   * Without fromBlock this is the whole history. With fromBlock, paging stops once the history
   * reaches blocks older than fromBlock (the caller filters the remainder). With limit only the
   * newest `limit` records are fetched.
   */
  getAddressTransfers(
    network: string,
    address: string,
    opts: { fromBlock?: number; limit?: number } = {}
  ): Promise<NodeRealTransfer[]> {
    // limit=0 / NaN would otherwise share the cache key of the full history while caching an empty result
    const positive = (value?: number) => (value != null && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined);
    opts = { fromBlock: positive(opts.fromBlock), limit: positive(opts.limit) };
    const key = `${network}:${address.toLowerCase()}:${opts.fromBlock || 0}:${opts.limit || 0}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.transfers;
    }
    const transfers = this.fetchAddressTransfers(network, address, opts);
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, transfers });
    transfers.catch(() => this.cache.delete(key));
    this.pruneCache();
    return transfers;
  }

  // Standard BSC JSON-RPC (eth_*) through the same NodeReal endpoint.
  web3(network: string): Web3 {
    const url = this.url(network);
    if (!this.web3s[url]) {
      this.web3s[url] = new Web3(new Web3.providers.HttpProvider(url, { timeout: TIMEOUT_MS }));
    }
    return this.web3s[url];
  }

  private async fetchAddressTransfers(network: string, address: string, opts: { fromBlock?: number; limit?: number }) {
    const { fromBlock, limit } = opts;
    const pageSize = limit ? Math.min(limit, PAGE_SIZE) : PAGE_SIZE;
    const transfers = new Array<NodeRealTransfer>();
    let pageKey: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call(network, 'nr_getTransactionByAddress', {
        address,
        category: ['external', '20'],
        order: 'desc',
        maxCount: '0x' + pageSize.toString(16),
        ...(pageKey ? { pageKey } : {})
      });
      const batch: NodeRealTransfer[] = (result && result.transfers) || [];
      transfers.push(...batch);
      pageKey = result && result.pageKey;
      const oldest = batch[batch.length - 1];
      const reachedFromBlock = fromBlock != null && oldest && parseInt(oldest.blockNum, 16) < fromBlock;
      const reachedLimit = limit != null && transfers.length >= limit;
      // A short page is the last one; asking for the next would only spend CUs on an empty page.
      if (!pageKey || batch.length < pageSize || reachedFromBlock || reachedLimit) {
        return limit != null ? transfers.slice(0, limit) : transfers;
      }
    }
    logger.warn(`NodeReal: history of ${address} truncated at ${MAX_PAGES * pageSize} records`);
    return transfers;
  }

  private async call(network: string, method: string, params: object) {
    for (let attempt = 0; ; attempt++) {
      // the concurrency slot is held only while a request is in flight, not while waiting to retry
      await this.acquire();
      try {
        return await this.post(network, method, params);
      } catch (err) {
        if (!(err as { retryable?: boolean }).retryable || attempt >= MAX_RETRIES) {
          throw err;
        }
      } finally {
        this.release();
      }
      await new Promise(resolve => setTimeout(resolve, exponentialBackoff(attempt, { initialMs: 500, maxMs: 4000 })));
    }
  }

  private post(network: string, method: string, params: object): Promise<any> {
    return new Promise((resolve, reject) => {
      request.post(
        this.url(network),
        { json: { jsonrpc: '2.0', id: 1, method, params: [params] }, timeout: TIMEOUT_MS },
        (err, res, body) => {
          if (err) {
            return reject(retryable(`NodeReal ${method}: ${redactApiKeys(err.message)}`));
          }
          if (res.statusCode === 429 || res.statusCode >= 500) {
            return reject(retryable(`NodeReal ${method}: HTTP ${res.statusCode}`));
          }
          if (res.statusCode !== 200 || !body || typeof body !== 'object') {
            return reject(new Error(`NodeReal ${method}: unexpected response (HTTP ${res.statusCode})`));
          }
          if (body.error) {
            const message = `NodeReal ${method}: ${body.error.message || JSON.stringify(body.error)}`;
            // The per-second limit (CUPS, code -32005 "...exceeded its Compute Units Per Second capacity")
            // clears within a second, so it is retried. Other JSON-RPC errors, including the monthly quota
            // ("ran out of cu", the same code), are final and billed like successful calls: not retried.
            const isRateLimited = /per second|cups/i.test(String(body.error.message || ''));
            return reject(isRateLimited ? retryable(message) : new Error(message));
          }
          return resolve(body.result);
        }
      );
    });
  }

  private async acquire() {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.active--;
    }
  }

  private pruneCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Converts NodeReal transfers into the lines DWS expects from /wallet/:pubKey/transactions,
 * oldest first (DWS reverses the list). Mirrors EVMListTransactionsStream + Erc20RelatedFilterTransform:
 * without tokenAddress only native (external) transactions are listed, with tokenAddress only
 * BEP20 transfers of that token.
 */
export function toWalletTransactions(
  transfers: NodeRealTransfer[],
  params: {
    chain: string;
    network: string;
    walletAddresses: string[];
    tokenAddress?: string;
    startBlock?: number;
    endBlock?: number;
  }
): WalletTransaction[] {
  const { chain, network, tokenAddress, startBlock, endBlock } = params;
  const own = new Set(params.walletAddresses.map(a => a.toLowerCase()));
  const token = tokenAddress && tokenAddress.toLowerCase();
  const seen = new Set<string>();
  const txs = new Array<WalletTransaction>();

  for (const t of transfers) {
    const height = parseInt(t.blockNum, 16);
    if ((startBlock != null && height < startBlock) || (endBlock != null && height > endBlock)) {
      continue;
    }
    const isToken = t.category === '20';
    if (token ? !isToken || (t.contractAddress || '').toLowerCase() !== token : t.category !== 'external') {
      continue;
    }
    const sending = own.has((t.from || '').toLowerCase());
    const receiving = own.has((t.to || '').toLowerCase());
    if (!sending && !receiving) {
      continue;
    }
    // The same record comes twice when two own addresses are both in it. Two transfers of one tx with the
    // same from/to/value (e.g. a multisend) are different records, told apart by their log/trace index.
    const dedupKey = `${t.hash}:${t.category}:${t.logIndex ?? ''}:${t.traceIndex ?? ''}:${t.from}:${t.to}:${t.value}`;
    if (seen.has(dedupKey)) {
      continue;
    }
    seen.add(dedupKey);

    const from = t.from ? Web3.utils.toChecksumAddress(t.from) : '';
    const to = t.to ? Web3.utils.toChecksumAddress(t.to) : '';
    // wei amounts exceed Number.MAX_SAFE_INTEGER, keep them exact as decimal strings
    const value = hexToBigInt(t.value).toString();
    const category = sending ? (receiving ? 'move' : 'send') : 'receive';
    txs.push({
      txid: t.hash,
      fee: t.gasUsed != null && t.gasPrice != null ? (BigInt(t.gasUsed) * BigInt(t.gasPrice)).toString() : undefined,
      category,
      satoshis: category === 'send' && value !== '0' ? '-' + value : value,
      height,
      from,
      initialFrom: from,
      gasPrice: t.gasPrice,
      receipt: t.receiptsStatus == null ? undefined : { status: t.receiptsStatus === 1, gasUsed: t.gasUsed },
      address: to,
      blockTime: new Date(t.blockTimeStamp * 1000),
      abiType: isToken
        ? {
            type: 'ERC20',
            name: 'transfer',
            params: [
              { name: '_to', value: to.toLowerCase(), type: 'address' },
              { name: '_value', value: hexToBigInt(t.value).toString(), type: 'uint256' }
            ]
          }
        : undefined,
      internal: [],
      calls: [],
      network,
      chain,
      data: ''
    });
  }
  return txs.sort((a, b) => a.height - b.height);
}

export const NodeReal = new NodeRealClient();
