import { expect } from 'chai';
import * as sinon from 'sinon';
import { BitcoinP2PWorker } from '../../../src/modules/bitcoin/p2p';
import { EVMP2pWorker } from '../../../src/providers/chain-state/evm/p2p/p2p';

// sync() used to set its "syncing" flag and then read the database outside any try/catch: with the
// database down the flag stayed set and every later sync() returned false, so syncing stopped for good.
describe('P2P sync recovery', function() {
  this.timeout(5000);

  it('EVM: should reset the flag and retry when a read before the block loop fails', async () => {
    const worker: any = Object.create(EVMP2pWorker.prototype);
    Object.assign(worker, {
      chain: 'DUCX',
      network: 'mainnet',
      syncing: false,
      syncFailures: 0,
      initialSyncComplete: true
    });
    worker.syncBlocks = sinon
      .stub()
      .onFirstCall()
      .rejects(Object.assign(new Error('connect ECONNREFUSED'), { name: 'MongoServerSelectionError' }))
      .onSecondCall()
      .callsFake(async () => {
        worker.syncing = false;
        return true;
      });

    expect(await worker.sync()).to.equal(true);
    expect(worker.syncBlocks.callCount).to.equal(2);
    expect(worker.syncing).to.equal(false);
    expect(worker.syncFailures).to.equal(0);
  });

  it('Bitcoin: should reset the flag and retry when a read before the block loop fails', async () => {
    const worker: any = Object.create(BitcoinP2PWorker.prototype);
    Object.assign(worker, { chain: 'DUC', network: 'mainnet', isSyncing: false, syncFailures: 0 });
    worker.syncBlocks = sinon
      .stub()
      .onFirstCall()
      .rejects(Object.assign(new Error('connect ECONNREFUSED'), { name: 'MongoServerSelectionError' }))
      .onSecondCall()
      .callsFake(async () => {
        worker.isSyncing = false;
        return true;
      });

    expect(await worker.sync()).to.equal(true);
    expect(worker.syncBlocks.callCount).to.equal(2);
    expect(worker.isSyncing).to.equal(false);
  });

  it('should not start retrying when the error comes from stopping the worker', async () => {
    for (const [Worker, flag] of [
      [EVMP2pWorker, 'syncing'],
      [BitcoinP2PWorker, 'isSyncing']
    ] as const) {
      const worker: any = Object.create((Worker as any).prototype);
      Object.assign(worker, {
        chain: 'X',
        network: 'mainnet',
        [flag]: false,
        syncFailures: 0,
        initialSyncComplete: true
      });
      worker.syncBlocks = sinon.stub().callsFake(async () => {
        worker.stopping = true; // stop() ran while the sync was in flight
        throw new Error('Topology is closed, please connect');
      });
      expect(await worker.sync()).to.equal(false);
      expect(worker.syncBlocks.callCount).to.equal(1);
      expect(worker[flag]).to.equal(false);
    }
  });
});
