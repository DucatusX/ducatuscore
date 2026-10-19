'use strict';

var chai = require('chai');
var should = chai.should();
var { Web3 } = require('@ducatuscore/crypto');
var { toWeiBN, sumOutputsWei, txpTotalWei, lockedSumWei } = require('../../ts_build/lib/chain/weiamount');

// 100.59999993 DUCX in wei.
const AWKWARD_WEI = '100599999930000000000';

describe('wei amount helpers', function() {

  describe('toWeiBN', function() {
    it('should keep a wei string exact', function() {
      toWeiBN(AWKWARD_WEI).toString().should.equal(AWKWARD_WEI);
    });

    it('should treat null/undefined/empty as zero', function() {
      toWeiBN(null).toString().should.equal('0');
      toWeiBN(undefined).toString().should.equal('0');
      toWeiBN('').toString().should.equal('0');
    });

    it('should accept a BN', function() {
      toWeiBN(Web3.utils.toBN(AWKWARD_WEI).toString()).toString().should.equal(AWKWARD_WEI);
    });

    it('should accept large numbers that String() would render exponentially', function() {
      // Web3's toBN throws on '1e+21'; this is the case that used to blow up sendMax on EVM chains.
      (function() { Web3.utils.toBN(1e21); }).should.throw();
      toWeiBN(1e21).toString().should.equal('1000000000000000000000');
    });

    it('should accept small numbers and negatives', function() {
      toWeiBN(21000).toString().should.equal('21000');
      toWeiBN(-21000).toString().should.equal('-21000');
      toWeiBN('-21000').toString().should.equal('-21000');
    });
  });

  describe('sumOutputsWei / txpTotalWei', function() {
    it('should add string output amounts instead of concatenating them', function() {
      const outputs = [{ amount: '1000000000000000000' }, { amount: '2000000000000000000' }];
      // This is what lodash sumBy does to the same data.
      const _ = require('lodash');
      _.sumBy(outputs, 'amount').should.equal('10000000000000000002000000000000000000');
      sumOutputsWei(outputs).toString().should.equal('3000000000000000000');
    });

    it('should prefer outputs over the stored txp.amount', function() {
      const txp = { amount: '0', outputs: [{ amount: AWKWARD_WEI }] };
      txpTotalWei(txp).toString().should.equal(AWKWARD_WEI);
    });

    it('should fall back to txp.amount when there are no outputs', function() {
      txpTotalWei({ amount: AWKWARD_WEI, outputs: [] }).toString().should.equal(AWKWARD_WEI);
      txpTotalWei({ amount: AWKWARD_WEI }).toString().should.equal(AWKWARD_WEI);
    });

    it('should treat an empty txp as zero', function() {
      txpTotalWei(null).toString().should.equal('0');
      txpTotalWei({}).toString().should.equal('0');
    });
  });

  describe('lockedSumWei', function() {
    it('should sum pending txps exactly', function() {
      const txps = [
        { outputs: [{ amount: AWKWARD_WEI }] },
        { outputs: [{ amount: '1' }] }
      ];
      lockedSumWei(txps).toString().should.equal('100599999930000000001');
    });

    it('should return zero for no pending txps', function() {
      lockedSumWei([]).toString().should.equal('0');
      lockedSumWei(null).toString().should.equal('0');
    });
  });
});
