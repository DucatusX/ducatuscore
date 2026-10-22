'use strict';

var chai = require('chai');
var should = chai.should();
var { Storage } = require('../ts_build/lib/storage');

describe('Storage.connect', function() {
  it('should fail at once on a malformed connection string instead of retrying it forever', function(done) {
    this.timeout(5000);
    let calls = 0;
    new Storage().connect({ mongoDb: { uri: 'not-a-mongodb-uri', dbname: 'x' } }, err => {
      calls++;
      should.exist(err);
      err.name.should.equal('MongoParseError');
      setTimeout(() => {
        calls.should.equal(1);
        done();
      }, 50);
    });
  });
});
