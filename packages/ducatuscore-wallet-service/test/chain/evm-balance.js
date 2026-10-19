'use strict';

var chai = require('chai');
var sinon = require('sinon');
var should = chai.should();
var { ChainService } = require('../../ts_build/lib/chain');
var { EthChain } = require('../../ts_build/lib/chain/eth');
var { DucxChain } = require('../../ts_build/lib/chain/ducx');
var Errors = require('../../ts_build/lib/errors/errordefinitions');

// 57.899999999999997952 <coin> in wei - the balance from the bug report. Not a representable
// double, so Number() used to round it up to 57900000000000000000 (a flat 57.9).
const AWKWARD_WEI = '57899999999999997952';
const ONE_WEI_MORE = '57899999999999997953';

[
  { name: 'ETH', Chain: EthChain, chain: 'eth' },
  { name: 'DUCX', Chain: DucxChain, chain: 'ducx' }
].forEach(({ name, Chain, chain }) => {

  describe(`EVM balance precision (${name})`, function() {
    let instance;
    let sandbox;

    beforeEach(function() {
      instance = new Chain();
      sandbox = sinon.createSandbox();
    });

    afterEach(function() {
      sandbox.restore();
    });

    function fakeServer(balances, txps) {
      return {
        walletId: 'wid',
        _getBlockchainExplorer: () => ({
          getBalance: (wallet, cb) => cb(null, balances.node)
        }),
        getPendingTxs: (opts, cb) => cb(null, txps || []),
        storage: {
          fetchAddresses: (walletId, cb) => cb(null, [{ address: '0x01', path: 'm/0/0' }])
        },
        getBalance: (opts, cb) => cb(null, opts.tokenAddress ? balances.token : balances.native)
      };
    }

    describe('getWalletBalance', function() {

      it('should return exact wei strings straight through', function(done) {
        const server = fakeServer({ node: { confirmed: AWKWARD_WEI, unconfirmed: '0', balance: AWKWARD_WEI } });
        instance.getWalletBalance(server, { chain, network: 'livenet' }, {}, (err, balance) => {
          should.not.exist(err);
          balance.totalAmount.should.equal(AWKWARD_WEI);
          balance.totalConfirmedAmount.should.equal(AWKWARD_WEI);
          balance.lockedAmount.should.equal('0');
          balance.availableAmount.should.equal(AWKWARD_WEI);
          balance.availableConfirmedAmount.should.equal(AWKWARD_WEI);
          balance.byAddress[0].amount.should.equal(AWKWARD_WEI);
          done();
        });
      });

      it('should subtract pending txps by the wei, not by the double', function(done) {
        // Locking one single wei: a JS number subtraction at this magnitude is a no-op.
        const server = fakeServer(
          { node: { confirmed: ONE_WEI_MORE, unconfirmed: '0', balance: ONE_WEI_MORE } },
          [{ amount: '1', outputs: [{ amount: '1' }] }]
        );
        instance.getWalletBalance(server, { chain, network: 'livenet' }, {}, (err, balance) => {
          should.not.exist(err);
          balance.lockedAmount.should.equal('1');
          balance.availableAmount.should.equal(AWKWARD_WEI);
          // The pre-fix arithmetic could not see the difference at all.
          (Number(ONE_WEI_MORE) - 1).should.equal(Number(ONE_WEI_MORE));
          // ...and it did not even hold the balance it started from.
          BigInt(Number(AWKWARD_WEI)).toString().should.equal('57900000000000000000');
          done();
        });
      });

      it('should add pending txp amounts rather than concatenate them', function(done) {
        const server = fakeServer(
          { node: { confirmed: '5000000000000000000', unconfirmed: '0', balance: '5000000000000000000' } },
          [
            { amount: '1000000000000000000', outputs: [{ amount: '1000000000000000000' }] },
            { amount: '2000000000000000000', outputs: [{ amount: '2000000000000000000' }] }
          ]
        );
        instance.getWalletBalance(server, { chain, network: 'livenet' }, {}, (err, balance) => {
          should.not.exist(err);
          balance.lockedAmount.should.equal('3000000000000000000');
          balance.availableAmount.should.equal('2000000000000000000');
          done();
        });
      });

      it('should still handle numeric balances from an older node', function(done) {
        const server = fakeServer({ node: { confirmed: 5, unconfirmed: 0, balance: 5 } }, []);
        instance.getWalletBalance(server, { chain, network: 'livenet' }, {}, (err, balance) => {
          should.not.exist(err);
          balance.totalAmount.should.equal('5');
          balance.availableAmount.should.equal('5');
          done();
        });
      });
    });

    describe('getWalletSendMaxInfo', function() {

      it('should subtract the fee without losing wei', function(done) {
        const server = {
          getBalance: (opts, cb) => cb(null, { totalAmount: AWKWARD_WEI, availableAmount: AWKWARD_WEI })
        };
        instance.getWalletSendMaxInfo(server, {}, { feePerKb: 1000000000 }, (err, info) => {
          should.not.exist(err);
          const expected = (BigInt(AWKWARD_WEI) - BigInt(info.fee)).toString();
          info.amount.should.equal(expected);
          done();
        });
      });
    });

    describe('selectTxInputs', function() {

      function run(balances, txp, opts, cb) {
        const server = fakeServer(balances);
        sandbox.stub(instance, 'checkTx').returns(null);
        instance.selectTxInputs(server, txp, {}, opts || {}, cb);
      }

      it('should allow a transfer of the full available balance', function(done) {
        run(
          { native: { totalAmount: AWKWARD_WEI, availableAmount: AWKWARD_WEI } },
          { fee: '0', amount: AWKWARD_WEI, outputs: [{ amount: AWKWARD_WEI }] },
          {},
          err => {
            should.not.exist(err);
            done();
          }
        );
      });

      it('should reject a transfer one wei over the balance', function(done) {
        run(
          { native: { totalAmount: AWKWARD_WEI, availableAmount: AWKWARD_WEI } },
          { fee: '0', amount: ONE_WEI_MORE, outputs: [{ amount: ONE_WEI_MORE }] },
          {},
          err => {
            should.exist(err);
            err.code.should.equal(Errors.INSUFFICIENT_FUNDS.code);
            done();
          }
        );
      });

      it('should not compare amounts lexicographically', function(done) {
        // '9000...' > '10000...' as strings, so a string comparison would call this affordable.
        run(
          { native: { totalAmount: '9000000000000000000', availableAmount: '9000000000000000000' } },
          { fee: '0', amount: '10000000000000000000', outputs: [{ amount: '10000000000000000000' }] },
          {},
          err => {
            should.exist(err);
            err.code.should.equal(Errors.INSUFFICIENT_FUNDS.code);
            done();
          }
        );
      });

      it('should report locked funds when the balance is only locked up', function(done) {
        run(
          { native: { totalAmount: AWKWARD_WEI, availableAmount: '0' } },
          { fee: '0', amount: AWKWARD_WEI, outputs: [{ amount: AWKWARD_WEI }] },
          {},
          err => {
            should.exist(err);
            err.code.should.equal(Errors.LOCKED_FUNDS.code);
            done();
          }
        );
      });

      it('should account for the fee on native transfers', function(done) {
        run(
          { native: { totalAmount: AWKWARD_WEI, availableAmount: AWKWARD_WEI } },
          { fee: '21000000000000', amount: AWKWARD_WEI, outputs: [{ amount: AWKWARD_WEI }] },
          {},
          err => {
            should.exist(err);
            err.code.should.equal(Errors.codes.INSUFFICIENT_FUNDS_FOR_FEE);
            done();
          }
        );
      });

      it('should sum multi-output txps instead of concatenating them', function(done) {
        // _.sumBy over string amounts used to yield '10000000000000000002000000000000000000'.
        run(
          { native: { totalAmount: '5000000000000000000', availableAmount: '5000000000000000000' } },
          {
            fee: '0',
            amount: '3000000000000000000',
            outputs: [{ amount: '1000000000000000000' }, { amount: '2000000000000000000' }]
          },
          {},
          err => {
            should.not.exist(err);
            done();
          }
        );
      });

      it('should check the native balance for the fee on token transfers', function(done) {
        run(
          {
            token: { totalAmount: '1000000', availableAmount: '1000000' },
            native: { totalAmount: '1000', availableAmount: '1000' }
          },
          { fee: '21000000000000', amount: '1000000', outputs: [{ amount: '1000000' }] },
          { tokenAddress: '0xtoken' },
          err => {
            should.exist(err);
            err.code.should.equal(
              chain === 'eth' ? Errors.codes.INSUFFICIENT_ETH_FEE : Errors.codes.INSUFFICIENT_DUCX_FEE
            );
            done();
          }
        );
      });
    });
  });
});
