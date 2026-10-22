import { expect } from 'chai';
import request from 'request';
import * as sinon from 'sinon';
import Web3 from 'web3';
import { BNB } from '../../../../src/modules/bnb/api/csp';
import {
  NodeReal,
  NodeRealClient,
  NodeRealTransfer,
  redactApiKeys,
  toWalletTransactions
} from '../../../../src/modules/bnb/api/nodereal';

const WALLET = Web3.utils.toChecksumAddress('0x376f5c186e6eddb5c0b173c1d9c4fe038a8e1e7e');
const OTHER = '0xec6301f48dc2fe995eaaee3f54cdd84606f48fce';
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const WALLET_LC = WALLET.toLowerCase();

const transfer = (overrides: Partial<NodeRealTransfer>): NodeRealTransfer => ({
  category: 'external',
  blockNum: '0x64',
  from: WALLET_LC,
  to: OTHER,
  value: '0x3b9aca00',
  asset: 'BNB',
  hash: '0x01',
  contractAddress: '0x0000000000000000000000000000000000000000',
  blockTimeStamp: 1792500000,
  gasPrice: 50000000,
  gasUsed: 21000,
  receiptsStatus: 1,
  ...overrides
});

const params = { chain: 'BNB', network: 'mainnet', walletAddresses: [WALLET] };

describe('BNB NodeReal history', function() {
  describe('toWalletTransactions', () => {
    it('should map an outgoing transfer the way EVMListTransactionsStream does', () => {
      const [tx] = toWalletTransactions([transfer({})], params);
      expect(tx).to.include({
        txid: '0x01',
        category: 'send',
        satoshis: '-1000000000',
        height: 100,
        fee: String(21000 * 50000000),
        from: WALLET,
        initialFrom: WALLET,
        chain: 'BNB',
        network: 'mainnet',
        data: ''
      });
      expect(tx.address.toLowerCase()).to.equal(OTHER);
      expect(tx.receipt).to.deep.equal({ status: true, gasUsed: 21000 });
      expect(tx.blockTime.toISOString()).to.equal(new Date(1792500000 * 1000).toISOString());
    });

    it('should mark incoming and self transfers', () => {
      const txs = toWalletTransactions(
        [transfer({ hash: '0x02', from: OTHER, to: WALLET_LC }), transfer({ hash: '0x03', to: WALLET_LC })],
        params
      );
      expect(txs.map(tx => [tx.txid, tx.category, tx.satoshis])).to.deep.equal([
        ['0x02', 'receive', '1000000000'],
        ['0x03', 'move', '1000000000']
      ]);
    });

    it('should flag failed transactions through the receipt status', () => {
      const [tx] = toWalletTransactions([transfer({ receiptsStatus: 0 })], params);
      expect(tx.receipt!.status).to.equal(false);
    });

    it('should list only native transactions without tokenAddress', () => {
      const txs = toWalletTransactions(
        [transfer({ hash: '0x04', category: '20', contractAddress: USDT }), transfer({ hash: '0x05' })],
        params
      );
      expect(txs.map(tx => tx.txid)).to.deep.equal(['0x05']);
    });

    it('should list only transfers of the requested token with an ERC20 abiType', () => {
      const tokenValue = '0x00000000000000000000000000000000000000000000026a55b55082fb179800';
      const txs = toWalletTransactions(
        [
          transfer({
            hash: '0x06',
            category: '20',
            contractAddress: USDT,
            from: OTHER,
            to: WALLET_LC,
            value: tokenValue
          }),
          transfer({ hash: '0x07', category: '20', contractAddress: OTHER }),
          transfer({ hash: '0x08' })
        ],
        { ...params, tokenAddress: '0x55d398326f99059fF775485246999027B3197955' }
      );
      expect(txs).to.have.length(1);
      expect(txs[0]).to.include({ txid: '0x06', category: 'receive' });
      expect(txs[0].abiType).to.deep.equal({
        type: 'ERC20',
        name: 'transfer',
        params: [
          { name: '_to', value: WALLET_LC, type: 'address' },
          { name: '_value', value: BigInt(tokenValue).toString(), type: 'uint256' }
        ]
      });
    });

    it('should skip transfers that do not touch the wallet', () => {
      expect(toWalletTransactions([transfer({ from: OTHER, to: USDT })], params)).to.deep.equal([]);
    });

    it('should apply startBlock/endBlock, drop duplicates and sort oldest first', () => {
      const txs = toWalletTransactions(
        [
          transfer({ hash: '0x0c', blockNum: '0xc8' }),
          transfer({ hash: '0x0b', blockNum: '0x96' }),
          transfer({ hash: '0x0b', blockNum: '0x96' }),
          transfer({ hash: '0x0a', blockNum: '0x64' })
        ],
        { ...params, startBlock: 150, endBlock: 200 }
      );
      expect(txs.map(tx => tx.txid)).to.deep.equal(['0x0b', '0x0c']);
    });

    it('should keep separate transfers of one tx with equal from/to/value (multisend)', () => {
      const tokenTransfer = (logIndex: number) =>
        transfer({ hash: '0x0d', category: '20', contractAddress: USDT, from: OTHER, to: WALLET_LC, logIndex });
      const txs = toWalletTransactions([tokenTransfer(3), tokenTransfer(7), tokenTransfer(7)], {
        ...params,
        tokenAddress: USDT
      });
      expect(txs).to.have.length(2);
    });

    it('should treat an empty value as zero', () => {
      const [tx] = toWalletTransactions([transfer({ value: '0x' })], params);
      expect(tx.satoshis).to.equal('0');
    });

    it('should keep wei amounts and fees exact beyond Number.MAX_SAFE_INTEGER', () => {
      // 11403.43 tokens at 18 decimals: Number() would turn 11403428223533225922559 into 11403428223533227000000
      const [tx] = toWalletTransactions(
        [transfer({ value: '0x26a2e5b6f59f1b0cfff', gasUsed: 7000000, gasPrice: 9007199254741 })],
        params
      );
      expect(tx.satoshis).to.equal('-' + BigInt('0x26a2e5b6f59f1b0cfff').toString());
      expect(tx.fee).to.equal((BigInt(7000000) * BigInt(9007199254741)).toString());
    });
  });

  describe('redactApiKeys', () => {
    it('should hide the key in NodeReal endpoint URLs', () => {
      expect(
        redactApiKeys(
          "CONNECTION ERROR: Couldn't connect to node https://bsc-mainnet.nodereal.io/v1/ca5b35a38b3b4a7ab554fd3961bb8ddf."
        )
      ).to.equal("CONNECTION ERROR: Couldn't connect to node https://bsc-mainnet.nodereal.io/v1/***.");
      expect(redactApiKeys('wss://bsc-mainnet.nodereal.io/ws/v1/abc123 closed')).to.equal(
        'wss://bsc-mainnet.nodereal.io/ws/v1/*** closed'
      );
      expect(redactApiKeys('HTTP 429')).to.equal('HTTP 429');
    });
  });

  describe('NodeRealClient', () => {
    let sandbox: sinon.SinonSandbox;
    let post: sinon.SinonStub;
    const page = (count: number, firstBlock: number, pageKey = '') => ({
      transfers: Array.from({ length: count }, (_, i) =>
        transfer({ hash: '0x' + (firstBlock - i).toString(16), blockNum: '0x' + (firstBlock - i).toString(16) })
      ),
      pageKey
    });
    const respondWith = (...results: any[]) => {
      results.forEach((result, i) =>
        post.onCall(i).callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, result))
      );
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      post = sandbox.stub(request, 'post');
    });
    afterEach(() => sandbox.restore());

    it('should request both directions of native and BEP20 transfers, newest first', async () => {
      respondWith({ jsonrpc: '2.0', id: 1, result: page(3, 300) });
      const transfers = await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET);
      expect(transfers).to.have.length(3);
      const [url, opts] = post.firstCall.args;
      expect(url).to.equal('https://bsc-mainnet.nodereal.io/v1/key');
      expect(opts.json.method).to.equal('nr_getTransactionByAddress');
      expect(opts.json.params[0]).to.deep.equal({
        address: WALLET,
        category: ['external', '20'],
        order: 'desc',
        maxCount: '0x3e8'
      });
    });

    it('should follow pageKey and stop at a short page', async () => {
      respondWith({ result: page(1000, 5000, 'next') }, { result: page(10, 4000, 'more') });
      const transfers = await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET);
      expect(transfers).to.have.length(1010);
      expect(post.callCount).to.equal(2);
      expect(post.secondCall.args[1].json.params[0].pageKey).to.equal('next');
    });

    it('should stop paging once the history is older than fromBlock', async () => {
      respondWith({ result: page(1000, 5000, 'next') }, { result: page(1000, 4000, 'next') });
      await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET, { fromBlock: 4500 });
      expect(post.callCount).to.equal(1);
    });

    it('should reuse a cached response for the same request', async () => {
      respondWith({ result: page(2, 300) });
      const client = new NodeRealClient('key');
      await client.getAddressTransfers('mainnet', WALLET);
      await client.getAddressTransfers('mainnet', WALLET.toLowerCase());
      expect(post.callCount).to.equal(1);
    });

    it('should treat limit=0 / NaN as no limit instead of caching an empty history', async () => {
      respondWith({ result: page(3, 300) }, { result: page(3, 300) });
      const client = new NodeRealClient('key');
      expect(await client.getAddressTransfers('mainnet', WALLET, { limit: 0 })).to.have.length(3);
      expect(await client.getAddressTransfers('mainnet', WALLET, { limit: NaN })).to.have.length(3);
      expect(await client.getAddressTransfers('mainnet', WALLET)).to.have.length(3);
      expect(post.callCount).to.equal(1);
      expect(post.firstCall.args[1].json.params[0].maxCount).to.equal('0x3e8');
    });

    it('should not retry JSON-RPC errors, they are billed', async () => {
      respondWith({ error: { code: -32000, message: 'illegal request param' } });
      const err = await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET).catch(e => e);
      expect(err.message).to.equal('NodeReal nr_getTransactionByAddress: illegal request param');
      expect(post.callCount).to.equal(1);
    });

    it('should retry the per-second limit (CUPS) but not the exhausted monthly quota', async () => {
      const cups = {
        error: { code: -32005, message: 'Your account has exceeded its Compute Units Per Second capacity.' }
      };
      respondWith(cups, { result: page(1, 10) });
      expect(await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET)).to.have.length(1);
      expect(post.callCount).to.equal(2);

      post.resetHistory();
      post.resetBehavior();
      respondWith({ error: { code: -32005, message: 'ran out of cu' } });
      const err = await new NodeRealClient('key').getAddressTransfers('mainnet', OTHER).catch(e => e);
      expect(err.message).to.equal('NodeReal nr_getTransactionByAddress: ran out of cu');
      expect(post.callCount).to.equal(1);
    });

    it('should retry rate-limited requests', async () => {
      post.onCall(0).callsFake((_url, _opts, cb) => cb(null, { statusCode: 429 }, 'Too Many Requests'));
      post.onCall(1).callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, { result: page(1, 10) }));
      const transfers = await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET);
      expect(transfers).to.have.length(1);
      expect(post.callCount).to.equal(2);
    });

    it('should reject a non-JSON response instead of crashing', async () => {
      post.callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, '<html>Bad gateway</html>'));
      const err = await new NodeRealClient('key').getAddressTransfers('mainnet', WALLET).catch(e => e);
      expect(err.message).to.match(/unexpected response/);
    });

    describe('API keys', () => {
      const saved = { keys: process.env.NODEREAL_API_KEYS, key: process.env.NODEREAL_API_KEY };
      const setEnv = (name: string, value?: string) =>
        value === undefined ? delete process.env[name] : (process.env[name] = value);
      const usedKeys = () => post.getCalls().map(c => c.args[0].split('/').pop());

      beforeEach(() => {
        delete process.env.NODEREAL_API_KEYS;
        delete process.env.NODEREAL_API_KEY;
      });
      afterEach(() => {
        setEnv('NODEREAL_API_KEYS', saved.keys);
        setEnv('NODEREAL_API_KEY', saved.key);
      });

      it('should use NODEREAL_API_KEY when NODEREAL_API_KEYS is not set', async () => {
        process.env.NODEREAL_API_KEY = 'single';
        post.callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, { result: page(1, 10) }));
        const client = new NodeRealClient();
        await client.getAddressTransfers('mainnet', WALLET);
        await client.getAddressTransfers('mainnet', OTHER);
        expect(usedKeys()).to.deep.equal(['single', 'single']);
      });

      it('should rotate NODEREAL_API_KEYS in order on every request', async () => {
        process.env.NODEREAL_API_KEY = 'single';
        process.env.NODEREAL_API_KEYS = 'k1, k2,,k3 ';
        post.callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, { result: page(1, 10) }));
        const client = new NodeRealClient();
        for (const address of [WALLET, OTHER, USDT, '0x01', '0x02']) {
          await client.getAddressTransfers('mainnet', address);
        }
        expect(usedKeys()).to.deep.equal(['k1', 'k2', 'k3', 'k1', 'k2']);
      });

      it('should spread pages and retries over the keys too', async () => {
        post.onCall(0).callsFake((_url, _opts, cb) => cb(null, { statusCode: 429 }, 'Too Many Requests'));
        post
          .onCall(1)
          .callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, { result: page(1000, 5000, 'next') }));
        post.onCall(2).callsFake((_url, _opts, cb) => cb(null, { statusCode: 200 }, { result: page(3, 4000) }));
        await new NodeRealClient('a,b').getAddressTransfers('mainnet', WALLET);
        expect(usedKeys()).to.deep.equal(['a', 'b', 'a']);
      });

      it('should fail clearly without any API key', async () => {
        process.env.NODEREAL_API_KEYS = ' , ';
        const err = await new NodeRealClient().getAddressTransfers('mainnet', WALLET).catch(e => e);
        expect(err.message).to.equal('Neither NODEREAL_API_KEYS nor NODEREAL_API_KEY is set');
        expect(post.called).to.equal(false);
      });
    });
  });

  describe('BNBStateProvider.streamWalletTransactions', () => {
    let sandbox: sinon.SinonSandbox;
    const fakeRes = () => {
      const res: any = { statusCode: 200 };
      res.type = sinon.stub().returns(res);
      res.status = sinon.stub().callsFake(code => ((res.statusCode = code), res));
      res.send = sinon.stub().returns(res);
      return res;
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox.stub(BNB, 'getWalletAddresses').resolves([{ address: WALLET }] as any);
    });
    afterEach(() => sandbox.restore());

    it('should send the history as newline-delimited JSON for DWS', async () => {
      const get = sandbox
        .stub(NodeReal, 'getAddressTransfers')
        .resolves([
          transfer({ hash: '0x02', blockNum: '0xc8', from: OTHER, to: WALLET_LC }),
          transfer({ hash: '0x01' })
        ]);
      const res = fakeRes();
      await BNB.streamWalletTransactions({
        chain: 'BNB',
        network: 'mainnet',
        wallet: { _id: 'w' } as any,
        req: {} as any,
        res,
        args: { startBlock: '100' }
      });
      expect(get.firstCall.args).to.deep.equal(['mainnet', WALLET, { fromBlock: 100 }]);
      const lines = res.send.firstCall.args[0]
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      expect(lines.map(tx => [tx.txid, tx.category])).to.deep.equal([
        ['0x01', 'send'],
        ['0x02', 'receive']
      ]);
    });

    it('should answer 502 when NodeReal fails', async () => {
      sandbox.stub(NodeReal, 'getAddressTransfers').rejects(new Error('NodeReal nr_getTransactionByAddress: HTTP 503'));
      const res = fakeRes();
      await BNB.streamWalletTransactions({
        chain: 'BNB',
        network: 'mainnet',
        wallet: { _id: 'w' } as any,
        req: {} as any,
        res,
        args: {}
      });
      expect(res.statusCode).to.equal(502);
      expect(res.send.firstCall.args[0]).to.equal('NodeReal nr_getTransactionByAddress: HTTP 503');
    });
  });
});
