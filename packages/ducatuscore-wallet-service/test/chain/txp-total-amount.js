'use strict';

var chai = require('chai');
var should = chai.should();
var { TxProposal } = require('../../ts_build/lib/model/txproposal');

function txp(chain, outputs) {
  return TxProposal.fromObj({
    version: 3,
    chain,
    coin: chain,
    network: 'livenet',
    outputs,
    outputOrder: [0, 1],
    addressType: 'P2PKH'
  });
}

describe('TxProposal.getTotalAmount', function() {

  ['eth', 'ducx', 'bnb'].forEach(chain => {
    it(`should add wei-scale string outputs on ${chain} instead of concatenating them`, function() {
      const t = txp(chain, [{ amount: '1000000000000000000' }, { amount: '2000000000000000000' }]);
      t.getTotalAmount().should.equal('3000000000000000000');
    });

    it(`should keep a single ${chain} output exact`, function() {
      const t = txp(chain, [{ amount: '57899999999999997952' }]);
      t.getTotalAmount().should.equal('57899999999999997952');
    });

    it(`should return '0' for no outputs on ${chain}`, function() {
      txp(chain, []).getTotalAmount().should.equal('0');
    });
  });

  ['btc', 'bch', 'duc'].forEach(chain => {
    it(`should still sum ${chain} satoshis as a number`, function() {
      const t = txp(chain, [{ amount: 1000 }, { amount: 2500 }]);
      t.getTotalAmount().should.equal(3500);
    });
  });

  it('should be used for the stored txp.amount on EVM chains', function() {
    const t = txp('ducx', [{ amount: '1000000000000000000' }, { amount: '2000000000000000000' }]);
    // TxProposal.create assigns x.amount = x.getTotalAmount() when no explicit amount is given.
    t.getTotalAmount().should.equal('3000000000000000000');
    // sanity: 3 DUCX, not the 37-digit concatenation lodash used to produce
    t.getTotalAmount().length.should.equal(19);
    (BigInt(t.getTotalAmount()) / BigInt('1000000000000000000')).toString().should.equal('3');
  });
});
