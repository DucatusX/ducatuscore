import logger from '../../../logger';
import { BaseEVMStateProvider } from '../../../providers/chain-state/evm/api/csp';
import { EVMTransactionStorage } from '../../../providers/chain-state/evm/models/transaction';
import { EVMTransactionJSON, IEVMTransaction } from '../../../providers/chain-state/evm/types';
import { IBlock } from '../../../types/Block';
import {
  StreamAddressUtxosParams,
  StreamTransactionParams,
  StreamTransactionsParams,
  StreamWalletTransactionsParams,
  UpdateWalletParams
} from '../../../types/namespaces/ChainStateProvider';
import { hexToBigInt, NodeReal, NodeRealTransfer, redactApiKeys, toWalletTransactions } from './nodereal';

// Errors of NodeReal calls may carry the endpoint URL with the API key: never send or log them as is.
const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? redactApiKeys(err.message) : fallback);

// A missing or non-numeric value (e.g. blockHeight=abc, which the route parses to NaN) counts as not given.
const toNumber = (value?: string | number) => {
  const number = value != null && value !== '' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};

// BNB is not synced into Mongo: transaction data comes from NodeReal (indexer + JSON-RPC).
export class BNBStateProvider extends BaseEVMStateProvider {
  constructor() {
    super('BNB');
  }

  async getLocalTip({ chain, network }) {
    const { web3 } = await this.getWeb3(network);
    const latestBlock = await web3.eth.getBlock('latest');
    const time = new Date(Number(latestBlock.timestamp) * 1000);
    const localTip: IBlock = {
      ...latestBlock,
      height: latestBlock.number,
      processed: true,
      chain,
      network,
      time,
      timeNormalized: time,
      previousBlockHash: latestBlock.parentHash,
      nextBlockHash: '',
      transactionCount: latestBlock.transactions.length,
      reward: 0
    };
    return localTip;
  }

  async streamWalletTransactions(params: StreamWalletTransactionsParams) {
    const { chain, network, wallet, res, args = {} } = params;
    try {
      const walletAddresses = (await this.getWalletAddresses(wallet._id!)).map(walletAddress => walletAddress.address);
      const startBlock = toNumber(args.startBlock);
      const transfers = (
        await Promise.all(
          walletAddresses.map(address => NodeReal.getAddressTransfers(network, address, { fromBlock: startBlock }))
        )
      ).flat();
      const txs = toWalletTransactions(transfers, {
        chain,
        network,
        walletAddresses,
        tokenAddress: args.tokenAddress,
        startBlock,
        endBlock: toNumber(args.endBlock)
      });
      res.type('text/plain');
      res.send(txs.map(tx => JSON.stringify(tx) + '\n').join(''));
    } catch (err) {
      const message = errorMessage(err, 'Failed to get BNB wallet history');
      logger.error(`BNB wallet history error: ${message}`);
      res.status(502).send(message);
    }
  }

  // GET /tx/:txId. Unlike the Mongo version, errors propagate so an outage is not reported as "not found".
  async getTransaction(
    params: StreamTransactionParams
  ): Promise<(EVMTransactionJSON & { confirmations: number }) | undefined> {
    try {
      return await this.fetchTransaction(params);
    } catch (err) {
      throw new Error(errorMessage(err, 'Failed to get BNB transaction'));
    }
  }

  private async fetchTransaction(
    params: StreamTransactionParams
  ): Promise<(EVMTransactionJSON & { confirmations: number }) | undefined> {
    const { chain, network, txId } = params;
    const web3 = NodeReal.web3(network);
    const tx = await web3.eth.getTransaction(txId);
    if (!tx) {
      return undefined;
    }
    const mined = tx.blockNumber != null;
    const [receipt, block, tip] = await Promise.all([
      mined ? web3.eth.getTransactionReceipt(txId) : undefined,
      mined ? web3.eth.getBlock(tx.blockNumber!) : undefined,
      this.getLocalTip({ chain, network })
    ]);
    const blockTime = block ? new Date(Number(block.timestamp) * 1000) : new Date();
    const gasPrice = Number(tx.gasPrice);
    const effectiveGasPrice = receipt && Number((receipt as any).effectiveGasPrice || tx.gasPrice);
    const doc: IEVMTransaction = {
      chain,
      network,
      txid: tx.hash,
      blockHeight: mined ? tx.blockNumber! : -1,
      blockHash: tx.blockHash || undefined,
      blockTime,
      blockTimeNormalized: blockTime,
      data: Buffer.from(tx.input || '0x'),
      fee: receipt ? receipt.gasUsed * effectiveGasPrice! : tx.gas * gasPrice,
      value: Number(tx.value),
      gasLimit: tx.gas,
      gasPrice,
      nonce: tx.nonce,
      to: tx.to || '',
      from: tx.from,
      transactionIndex: tx.transactionIndex || 0,
      internal: [],
      calls: [],
      wallets: [],
      receipt: receipt
        ? {
            status: receipt.status,
            transactionHash: receipt.transactionHash,
            transactionIndex: receipt.transactionIndex,
            blockHash: receipt.blockHash,
            blockNumber: receipt.blockNumber,
            contractAddress: receipt.contractAddress || undefined,
            cumulativeGasUsed: receipt.cumulativeGasUsed,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs
          }
        : undefined
    };
    const abiType = EVMTransactionStorage.abiDecode(tx.input);
    if (abiType) {
      doc.abiType = abiType;
    }
    const json = EVMTransactionStorage._apiTransform(doc, { object: true }) as EVMTransactionJSON;
    // the tip comes from the configured RPC, which may lag NodeReal by a block or two
    const confirmations = mined && tip ? Math.max(1, tip.height - tx.blockNumber! + 1) : 0;
    return { ...json, confirmations };
  }

  // GET /tx/?blockHash= or ?blockHeight=. DWS only reads the txids of a block.
  async streamTransactions(params: StreamTransactionsParams) {
    const { chain, network, res, args } = params;
    try {
      const blockId = args.blockHash !== undefined ? args.blockHash : toNumber(args.blockHeight);
      if (blockId === undefined) {
        res.status(400).send('Must provide blockHash or blockHeight');
        return;
      }
      const block = await NodeReal.web3(network).eth.getBlock(blockId, true);
      if (!block) {
        res.json([]);
        return;
      }
      const tip = await this.getLocalTip({ chain, network });
      const blockTime = new Date(Number(block.timestamp) * 1000);
      res.json(
        block.transactions.map(tx => ({
          txid: tx.hash,
          chain,
          network,
          blockHeight: block.number,
          blockHash: block.hash,
          blockTime: blockTime.toISOString(),
          blockTimeNormalized: blockTime.toISOString(),
          from: tx.from,
          to: tx.to || '',
          value: Number(tx.value),
          fee: tx.gas * Number(tx.gasPrice),
          gasLimit: tx.gas,
          gasPrice: Number(tx.gasPrice),
          nonce: tx.nonce,
          data: tx.input,
          confirmations: tip ? Math.max(1, tip.height - block.number + 1) : 0
        }))
      );
    } catch (err) {
      const message = errorMessage(err, 'Failed to get BNB block transactions');
      logger.error(`BNB block transactions error: ${message}`);
      res.status(502).send(message);
    }
  }

  // GET /address/:address/txs. DWS uses it with limit=1 to check whether an address was ever used.
  async streamAddressTransactions(params: StreamAddressUtxosParams) {
    const { network, address, res, args } = params;
    try {
      const limit = toNumber(args.limit);
      const tokenAddress = args.tokenAddress && String(args.tokenAddress).toLowerCase();
      // With a token filter the newest records may belong to other tokens, so the limit is applied after filtering.
      const transfers = await NodeReal.getAddressTransfers(network, address, tokenAddress ? {} : { limit });
      const selected = transfers
        .filter(t =>
          tokenAddress ? t.category === '20' && (t.contractAddress || '').toLowerCase() === tokenAddress : true
        )
        .slice(0, limit || undefined);
      res!.json(selected.map(t => this.transferToAddressTx(t, network)));
    } catch (err) {
      const message = errorMessage(err, 'Failed to get BNB address transactions');
      logger.error(`BNB address transactions error: ${message}`);
      res!.status(502).send(message);
    }
  }

  // Nothing to attach: there are no synced BNB transactions, the history is read from NodeReal per request.
  protected async tagWalletTransactions(_params: UpdateWalletParams, _addressBatch: string[]) {}

  private transferToAddressTx(t: NodeRealTransfer, network: string) {
    const height = parseInt(t.blockNum, 16);
    const blockTime = new Date(t.blockTimeStamp * 1000).toISOString();
    return {
      txid: t.hash,
      chain: this.chain,
      network,
      blockHeight: height,
      blockTime,
      blockTimeNormalized: blockTime,
      from: t.from,
      to: t.to,
      value: t.category === '20' ? hexToBigInt(t.value).toString() : Number(hexToBigInt(t.value)),
      tokenAddress: t.category === '20' ? t.contractAddress : undefined,
      fee: t.gasUsed != null && t.gasPrice != null ? t.gasUsed * t.gasPrice : undefined,
      receipt: t.receiptsStatus == null ? undefined : { status: t.receiptsStatus === 1, gasUsed: t.gasUsed }
    };
  }
}

export const BNB = new BNBStateProvider();
