'use strict';

var chai = require('chai');
var should = chai.should();
var { EthChain } = require('../../ts_build/lib/chain/eth');
var { DucxChain } = require('../../ts_build/lib/chain/ducx');
var { WalletService } = require('../../ts_build/lib/server');

// The balance from the bug report, end to end.
const ON_CHAIN_WEI = '57899999999999997952';
const WHAT_NUMBER_MADE_OF_IT = '57900000000000000000';

function toDisplay(wei) {
  const v = BigInt(wei);
  const unit = BigInt('1000000000000000000');
  return (v / unit).toString() + '.' + (v % unit).toString().padStart(18, '0');
}

describe('balance regression: 57.9 vs 57.899999999999997952', function() {

  it('reproduces the old corruption', function() {
    // ducatuscore-node used to do Number(balance) in getBalanceForAddress.
    BigInt(Number(ON_CHAIN_WEI)).toString().should.equal(WHAT_NUMBER_MADE_OF_IT);
    toDisplay(BigInt(Number(ON_CHAIN_WEI))).should.equal('57.900000000000000000');
  });

  [
    { name: 'ETH', Chain: EthChain, chain: 'eth' },
    { name: 'DUCX', Chain: DucxChain, chain: 'ducx' }
  ].forEach(({ name, Chain, chain }) => {

    it(`carries the exact value through the ${name} wallet balance`, function(done) {
      const instance = new Chain();
      const server = {
        walletId: 'wid',
        _getBlockchainExplorer: () => ({
          // what the fixed node now returns: an exact decimal string
          getBalance: (wallet, cb) => cb(null, { confirmed: ON_CHAIN_WEI, unconfirmed: '0', balance: ON_CHAIN_WEI })
        }),
        getPendingTxs: (opts, cb) => cb(null, []),
        storage: { fetchAddresses: (walletId, cb) => cb(null, [{ address: '0x01', path: 'm/0/0' }]) }
      };

      instance.getWalletBalance(server, { chain, network: 'livenet' }, {}, (err, balance) => {
        should.not.exist(err);
        balance.totalAmount.should.equal(ON_CHAIN_WEI);
        balance.availableAmount.should.equal(ON_CHAIN_WEI);
        toDisplay(balance.totalAmount).should.equal('57.899999999999997952');
        done();
      });
    });
  });
});

describe('empty balance shape for incomplete wallets', function() {

  // getBalance short-circuits before touching storage when the wallet is incomplete, so the
  // prototype is enough here - no initialized server or mongo required.
  function getBalanceFor(chain, cb) {
    const server = Object.create(WalletService.prototype);
    server.getBalance({ wallet: { chain, coin: chain, isComplete: () => false } }, cb);
  }

  ['eth', 'ducx', 'bnb'].forEach(chain => {
    it(`should use decimal strings on ${chain}, matching a complete wallet`, function(done) {
      getBalanceFor(chain, (err, balance) => {
        should.not.exist(err);
        balance.totalAmount.should.equal('0');
        balance.lockedAmount.should.equal('0');
        balance.totalConfirmedAmount.should.equal('0');
        balance.lockedConfirmedAmount.should.equal('0');
        balance.availableAmount.should.equal('0');
        balance.availableConfirmedAmount.should.equal('0');
        done();
      });
    });
  });

  ['btc', 'bch', 'duc', 'xrp'].forEach(chain => {
    it(`should keep numbers on ${chain}`, function(done) {
      getBalanceFor(chain, (err, balance) => {
        should.not.exist(err);
        balance.totalAmount.should.equal(0);
        balance.availableAmount.should.equal(0);
        done();
      });
    });
  });
});
