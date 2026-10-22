import { ObjectId } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';
import Web3 from 'web3';
import { WalletAddressStorage } from '../../../../src/models/walletAddress';
import { BNB } from '../../../../src/modules/bnb/api/csp';
import { NodeReal, NodeRealTransfer } from '../../../../src/modules/bnb/api/nodereal';
import { EVMTransactionStorage } from '../../../../src/providers/chain-state/evm/models/transaction';
import { mockModel } from '../../../helpers';

const FROM = Web3.utils.toChecksumAddress('0x376f5c186e6eddb5c0b173c1d9c4fe038a8e1e7e');
const TOKEN = Web3.utils.toChecksumAddress('0x55d398326f99059ff775485246999027b3197955');
const RECIPIENT = '0xec6301f48dc2fe995eaaee3f54cdd84606f48fce';
const TRANSFER_INPUT = '0xa9059cbb' + RECIPIENT.slice(2).padStart(64, '0') + (1000).toString(16).padStart(64, '0');

const rpcTx = (overrides = {}) => ({
  hash: '0xaa',
  blockNumber: 100,
  blockHash: '0xbb',
  transactionIndex: 3,
  from: FROM,
  to: TOKEN,
  value: '0',
  gas: 60000,
  gasPrice: '50000000',
  input: TRANSFER_INPUT,
  nonce: 7,
  ...overrides
});

const fakeRes = () => {
  const res: any = { statusCode: 200 };
  res.status = sinon.stub().callsFake(code => ((res.statusCode = code), res));
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  return res;
};

const transfer = (overrides: Partial<NodeRealTransfer>): NodeRealTransfer => ({
  category: 'external',
  blockNum: '0x64',
  from: FROM.toLowerCase(),
  to: RECIPIENT,
  value: '0x10',
  hash: '0x01',
  blockTimeStamp: 1792500000,
  gasPrice: 50000000,
  gasUsed: 21000,
  receiptsStatus: 1,
  ...overrides
});

describe('BNB Chain State Provider (NodeReal)', function() {
  let sandbox: sinon.SinonSandbox;
  let eth: { [method: string]: sinon.SinonStub };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    eth = {
      getTransaction: sandbox.stub(),
      getTransactionReceipt: sandbox.stub(),
      getBlock: sandbox.stub()
    };
    sandbox.stub(NodeReal, 'web3').returns({ eth } as any);
    sandbox.stub(BNB, 'getLocalTip').resolves({ height: 110 } as any);
  });
  afterEach(() => sandbox.restore());

  describe('getTransaction', () => {
    it('should build a mined transaction from NodeReal JSON-RPC', async () => {
      eth.getTransaction.resolves(rpcTx());
      eth.getTransactionReceipt.resolves({
        status: true,
        transactionHash: '0xaa',
        transactionIndex: 3,
        blockHash: '0xbb',
        blockNumber: 100,
        cumulativeGasUsed: 90000,
        gasUsed: 40000,
        effectiveGasPrice: 50000000,
        logs: []
      });
      eth.getBlock.resolves({ timestamp: 1792500000 });

      const tx = await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' });

      expect(tx).to.include({
        txid: '0xaa',
        chain: 'BNB',
        network: 'mainnet',
        blockHeight: 100,
        blockHash: '0xbb',
        fee: 40000 * 50000000,
        from: FROM,
        to: TOKEN,
        nonce: 7,
        confirmations: 11,
        data: TRANSFER_INPUT
      });
      expect(tx!.blockTime).to.equal(new Date(1792500000 * 1000).toISOString());
      expect(tx!.receipt!.status).to.equal(true);
      expect(tx!.abiType).to.include({ type: 'ERC20', name: 'transfer' });
      expect(eth.getBlock.firstCall.args[0]).to.equal(100);
    });

    it('should report at least 1 confirmation when the RPC tip lags behind NodeReal', async () => {
      (BNB.getLocalTip as sinon.SinonStub).resolves({ height: 98 });
      eth.getTransaction.resolves(rpcTx());
      eth.getTransactionReceipt.resolves({ status: true, gasUsed: 40000, logs: [] });
      eth.getBlock.resolves({ timestamp: 1792500000 });
      const tx = await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' });
      expect(tx!.confirmations).to.equal(1);
    });

    it('should report a pending transaction with blockHeight -1', async () => {
      eth.getTransaction.resolves(rpcTx({ blockNumber: null, blockHash: null, transactionIndex: null }));
      const tx = await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' });
      expect(tx).to.include({ blockHeight: -1, confirmations: 0, fee: 60000 * 50000000 });
      expect(eth.getTransactionReceipt.called).to.equal(false);
    });

    it('should not leak the NodeReal API key in a thrown error', async () => {
      eth.getTransaction.rejects(
        new Error("CONNECTION ERROR: Couldn't connect to node https://bsc-mainnet.nodereal.io/v1/SECRETKEY.")
      );
      const err = await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' }).catch(e => e);
      expect(err.message).to.not.contain('SECRETKEY');
    });

    it('should return undefined for an unknown txid', async () => {
      eth.getTransaction.resolves(null);
      expect(await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' })).to.equal(undefined);
    });

    it('should propagate NodeReal errors instead of answering "not found"', async () => {
      eth.getTransaction.rejects(new Error('Invalid JSON RPC response'));
      const err = await BNB.getTransaction({ chain: 'BNB', network: 'mainnet', txId: '0xaa' }).catch(e => e);
      expect(err.message).to.equal('Invalid JSON RPC response');
    });
  });

  describe('streamTransactions', () => {
    it('should list the transactions of a block by hash', async () => {
      eth.getBlock.resolves({
        number: 100,
        hash: '0xbb',
        timestamp: 1792500000,
        transactions: [rpcTx(), rpcTx({ hash: '0xcc' })]
      });
      const res = fakeRes();
      await BNB.streamTransactions({
        chain: 'BNB',
        network: 'mainnet',
        req: {} as any,
        res,
        args: { blockHash: '0xbb' }
      });
      expect(eth.getBlock.firstCall.args).to.deep.equal(['0xbb', true]);
      const txs = res.json.firstCall.args[0];
      expect(txs.map(tx => tx.txid)).to.deep.equal(['0xaa', '0xcc']);
      expect(txs[0]).to.include({ blockHeight: 100, confirmations: 11 });
    });

    it('should not leak the NodeReal API key in the error response', async () => {
      eth.getBlock.rejects(
        new Error("CONNECTION ERROR: Couldn't connect to node https://bsc-mainnet.nodereal.io/v1/SECRETKEY.")
      );
      const res = fakeRes();
      await BNB.streamTransactions({
        chain: 'BNB',
        network: 'mainnet',
        req: {} as any,
        res,
        args: { blockHash: '0xbb' }
      });
      expect(res.statusCode).to.equal(502);
      expect(res.send.firstCall.args[0]).to.not.contain('SECRETKEY');
      expect(res.send.firstCall.args[0]).to.contain('/v1/***');
    });

    it('should accept blockHeight', async () => {
      eth.getBlock.resolves({ number: 100, hash: '0xbb', timestamp: 1792500000, transactions: [] });
      const res = fakeRes();
      await BNB.streamTransactions({
        chain: 'BNB',
        network: 'mainnet',
        req: {} as any,
        res,
        args: { blockHeight: '100' }
      });
      expect(eth.getBlock.firstCall.args).to.deep.equal([100, true]);
      expect(res.json.firstCall.args[0]).to.deep.equal([]);
    });

    it('should answer 400 to a non-numeric blockHeight without calling NodeReal', async () => {
      const res = fakeRes();
      await BNB.streamTransactions({ chain: 'BNB', network: 'mainnet', req: {} as any, res, args: { blockHeight: NaN } });
      expect(res.statusCode).to.equal(400);
      expect(eth.getBlock.called).to.equal(false);
    });

    it('should answer 502 when NodeReal fails', async () => {
      eth.getBlock.rejects(new Error('timeout'));
      const res = fakeRes();
      await BNB.streamTransactions({
        chain: 'BNB',
        network: 'mainnet',
        req: {} as any,
        res,
        args: { blockHash: '0xbb' }
      });
      expect(res.statusCode).to.equal(502);
    });
  });

  describe('streamAddressTransactions', () => {
    it('should fetch only `limit` records for the activity check', async () => {
      const get = sandbox.stub(NodeReal, 'getAddressTransfers').resolves([transfer({})]);
      const res = fakeRes();
      await BNB.streamAddressTransactions({
        chain: 'BNB',
        network: 'mainnet',
        address: FROM,
        res,
        args: { limit: '1' }
      });
      expect(get.firstCall.args).to.deep.equal(['mainnet', FROM, { limit: 1 }]);
      const txs = res.json.firstCall.args[0];
      expect(txs).to.have.length(1);
      expect(txs[0]).to.include({ txid: '0x01', blockHeight: 100, value: 16 });
    });

    it('should answer an empty list for an unused address', async () => {
      sandbox.stub(NodeReal, 'getAddressTransfers').resolves([]);
      const res = fakeRes();
      await BNB.streamAddressTransactions({
        chain: 'BNB',
        network: 'mainnet',
        address: FROM,
        res,
        args: { limit: '1' }
      });
      expect(res.json.firstCall.args[0]).to.deep.equal([]);
    });

    it('should filter by tokenAddress before applying the limit', async () => {
      sandbox
        .stub(NodeReal, 'getAddressTransfers')
        .resolves([
          transfer({ hash: '0x01', category: '20', contractAddress: RECIPIENT }),
          transfer({ hash: '0x02', category: '20', contractAddress: TOKEN.toLowerCase(), value: '0x3e8' })
        ]);
      const res = fakeRes();
      await BNB.streamAddressTransactions({
        chain: 'BNB',
        network: 'mainnet',
        address: FROM,
        res,
        args: { limit: '1', tokenAddress: TOKEN }
      });
      const txs = res.json.firstCall.args[0];
      expect(txs.map(tx => [tx.txid, tx.value])).to.deep.equal([['0x02', '1000']]);
    });
  });

  describe('updateWallet', () => {
    it('should register addresses without touching the transactions collection', async () => {
      mockModel('walletaddresses', {});
      mockModel('transactions', {});
      const txUpdate = EVMTransactionStorage.collection.updateMany as sinon.SinonStub;
      const addressWrite = WalletAddressStorage.collection.bulkWrite as sinon.SinonStub;
      await BNB.updateWallet({
        chain: 'BNB',
        network: 'mainnet',
        wallet: { _id: new ObjectId() } as any,
        addresses: [FROM]
      });
      expect(addressWrite.callCount).to.equal(1);
      expect(txUpdate.callCount).to.equal(0);
    });
  });
});
