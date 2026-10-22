import { expect } from 'chai';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { EventService } from '../../../src/services/event';

// Tail cursors are opened with noCursorTimeout, so one left open would never be reaped by the server.
describe('Event service tail cursors', () => {
  const cursor = (hasNext: sinon.SinonStub) => ({
    hasNext,
    next: sinon.stub().resolves({ payload: {} }),
    close: sinon.stub().resolves()
  });

  it('should close the cursor when reading it fails, and when it is drained', async () => {
    const failing = cursor(sinon.stub().rejects(new Error('connection 4 to 127.0.0.1:27017 closed')));
    const drained = cursor(sinon.stub().resolves(false));
    const eventModel: any = {
      getTxTail: sinon.stub().returns(failing),
      getBlockTail: sinon.stub().returns(drained),
      getCoinTail: sinon.stub().returns(cursor(sinon.stub().resolves(false)))
    };
    const service = new EventService({
      eventModel,
      storageService: { connected: true, connection: new EventEmitter() } as any,
      configService: { isDisabled: () => false } as any
    });

    await service.wireup();
    await new Promise(resolve => setTimeout(resolve, 20));
    service.stopped = true;

    expect(failing.close.callCount).to.equal(1);
    expect(drained.close.called).to.equal(true);
  });
});
