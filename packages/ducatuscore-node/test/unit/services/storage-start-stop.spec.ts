import { expect } from 'chai';
import { MongoClient } from 'mongodb';
import * as sinon from 'sinon';
import { StorageService } from '../../../src/services/storage';
import { isDatabaseConnectionError, isPermanentConnectionError } from '../../../src/utils/retry';

describe('Storage start/stop', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => sandbox.restore());

  it('should reject a start() that is waiting to retry when stop() is called', async () => {
    const connect = sandbox.stub(MongoClient, 'connect').rejects(new Error('connect ECONNREFUSED 127.0.0.1:27017'));
    const storage = new StorageService({
      configService: { get: () => ({ dbName: 'test', dbHost: '127.0.0.1', dbPort: '27017', dbUser: '', dbPass: '' }) } as any
    });

    const started = storage.start().then(
      () => 'resolved',
      err => err
    );
    await new Promise(resolve => setTimeout(resolve, 20)); // first attempt failed, the next one is scheduled
    await storage.stop();

    const err = await started;
    expect(err).to.be.instanceOf(Error);
    expect(err.message).to.equal('Storage service stopped before connecting to the database');
    // the workers' unhandledRejection handler must not treat it as a reason to shut down once more
    expect(isDatabaseConnectionError(err)).to.equal(true);
    expect(connect.callCount).to.equal(1);
  });

  const storageWith = (extra = {}) =>
    new StorageService({
      configService: {
        get: () => ({ dbName: 'test', dbHost: '127.0.0.1', dbPort: '27017', dbUser: '', dbPass: '', ...extra })
      } as any
    });

  it('should not retry an error that retrying cannot fix', async () => {
    const authError = Object.assign(new Error('Authentication failed.'), { name: 'MongoError', code: 18 });
    const connect = sandbox.stub(MongoClient, 'connect').rejects(authError);
    const err = await storageWith()
      .start()
      .catch(e => e);
    expect(err).to.equal(authError);
    expect(connect.callCount).to.equal(1);
    expect(isPermanentConnectionError(err)).to.equal(true);
    // so the worker shuts down (and is restarted) instead of ignoring it as a transient outage
    expect(isDatabaseConnectionError(err)).to.equal(false);
  });

  it('should add readPreference to the URL with & instead of a second ?', async () => {
    const connect = sandbox.stub(MongoClient, 'connect').rejects(Object.assign(new Error('bad'), { name: 'MongoParseError' }));
    await storageWith({ dbReadPreference: 'secondaryPreferred' })
      .start()
      .catch(() => undefined);
    expect(connect.firstCall.args[0]).to.equal(
      'mongodb://127.0.0.1:27017/test?socketTimeoutMS=3600000&noDelay=true&readPreference=secondaryPreferred'
    );
  });
});
