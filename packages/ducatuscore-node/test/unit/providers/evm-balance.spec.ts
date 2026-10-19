import { expect } from 'chai';
import * as sinon from 'sinon';
import { CacheStorage } from '../../../src/models/cache';
import { ETH } from '../../../src/modules/ethereum/api/csp';
import { BaseEVMStateProvider, toWeiBigInt, toWeiString } from '../../../src/providers/chain-state/evm/api/csp';

// 57.899999999999997952 ETH in wei. This is not a representable double (the spacing between
// doubles at this magnitude is 8192 wei), so Number() snapped it up to 57900000000000000000 and
// the wallet displayed a flat 57.900000000000000000.
const AWKWARD_WEI = '57899999999999997952';
const ROUNDED_BY_NUMBER = '57900000000000000000';

describe('EVM balance precision', function() {
  const network = 'regtest';

  describe('toWeiBigInt', () => {
    it('should keep a wei value exact', () => {
      expect(toWeiBigInt(AWKWARD_WEI).toString()).to.equal(AWKWARD_WEI);
    });

    it('should treat null, undefined and empty string as zero', () => {
      expect(toWeiBigInt(null).toString()).to.equal('0');
      expect(toWeiBigInt(undefined).toString()).to.equal('0');
      expect(toWeiBigInt('').toString()).to.equal('0');
    });

    it('should accept numbers left behind by older cache entries', () => {
      expect(toWeiBigInt(1234).toString()).to.equal('1234');
      // 1e21 renders as '1e+21' via String(), which BigInt() rejects outright.
      expect(toWeiBigInt(1e21).toString()).to.equal('1000000000000000000000');
    });

    it('should accept a bigint unchanged', () => {
      expect(toWeiBigInt(BigInt(AWKWARD_WEI)).toString()).to.equal(AWKWARD_WEI);
    });

    it('should not corrupt the value the way Number() does', () => {
      // The reported bug, exactly: 2048 wei appear out of nowhere and the balance reads as a
      // round 57.9.
      expect(BigInt(Number(AWKWARD_WEI)).toString()).to.equal(ROUNDED_BY_NUMBER);
      expect(BigInt(Number(AWKWARD_WEI)) - BigInt(AWKWARD_WEI)).to.equal(BigInt(2048));
      // ...and at that magnitude a double cannot represent a one-wei difference at all.
      expect(Number(AWKWARD_WEI) + 1).to.equal(Number(AWKWARD_WEI));

      expect(toWeiString(AWKWARD_WEI)).to.equal(AWKWARD_WEI);
      expect((toWeiBigInt(AWKWARD_WEI) + BigInt(1)).toString()).to.equal('57899999999999997953');
    });
  });

  describe('getBalanceForAddress', () => {
    const sandbox = sinon.createSandbox();
    afterEach(() => sandbox.restore());

    function stubCacheMiss() {
      sandbox.stub(CacheStorage, 'getGlobal').resolves(null);
      sandbox.stub(CacheStorage, 'setGlobal').resolves();
    }

    it('should return the native balance as an exact decimal string', async () => {
      stubCacheMiss();
      const web3Stub = { eth: { getBalance: sandbox.stub().resolves(AWKWARD_WEI) } };
      sandbox.stub(BaseEVMStateProvider.prototype, 'getWeb3').resolves({ web3: web3Stub } as any);

      const balance = await ETH.getBalanceForAddress({
        chain: 'ETH',
        network,
        address: '0xaBcD',
        args: {}
      } as any);

      expect(balance).to.deep.equal({ confirmed: AWKWARD_WEI, unconfirmed: '0', balance: AWKWARD_WEI });
    });

    it('should return a token balance as an exact decimal string', async () => {
      stubCacheMiss();
      sandbox.stub(BaseEVMStateProvider.prototype, 'getWeb3').resolves({ eth: {} } as any);
      sandbox.stub(BaseEVMStateProvider.prototype, 'erc20For').resolves({
        methods: { balanceOf: () => ({ call: sandbox.stub().resolves(AWKWARD_WEI) }) }
      } as any);

      const balance = await ETH.getBalanceForAddress({
        chain: 'ETH',
        network,
        address: '0xaBcD',
        args: { tokenAddress: '0xToKeN' }
      } as any);

      expect(balance).to.deep.equal({ confirmed: AWKWARD_WEI, unconfirmed: '0', balance: AWKWARD_WEI });
    });
  });

  describe('getWalletBalance', () => {
    const sandbox = sinon.createSandbox();
    afterEach(() => sandbox.restore());

    it('should sum address balances without losing wei', async () => {
      sandbox.stub(BaseEVMStateProvider.prototype, 'getWalletAddresses').resolves([
        { address: '0x01' },
        { address: '0x02' }
      ] as any);
      const perAddress = sandbox.stub(BaseEVMStateProvider.prototype, 'getBalanceForAddress');
      perAddress.onFirstCall().resolves({ confirmed: AWKWARD_WEI, unconfirmed: '0', balance: AWKWARD_WEI });
      perAddress.onSecondCall().resolves({ confirmed: '1', unconfirmed: '0', balance: '1' });

      const balance = await ETH.getWalletBalance({ network, wallet: { _id: 'abc' } } as any);

      // Exactly one wei more than the first address; a double could not represent the difference.
      expect(balance).to.deep.equal({
        unconfirmed: '0',
        confirmed: '57899999999999997953',
        balance: '57899999999999997953'
      });
    });

    it('should still sum numeric balances from an older provider', async () => {
      sandbox.stub(BaseEVMStateProvider.prototype, 'getWalletAddresses').resolves([{ address: '0x01' }] as any);
      sandbox
        .stub(BaseEVMStateProvider.prototype, 'getBalanceForAddress')
        .resolves({ confirmed: 5, unconfirmed: 2, balance: 7 });

      const balance = await ETH.getWalletBalance({ network, wallet: { _id: 'abc' } } as any);

      expect(balance).to.deep.equal({ unconfirmed: '2', confirmed: '5', balance: '7' });
    });
  });
});
