import { Rate, RatesByCoin } from '.';
import { Constants } from '../common/constants';
import { Defaults } from '../common/defaults';

export default {
  name: 'Coinbase',
  url: 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
  parseFn(res) {
    const ratesByCoin: RatesByCoin = {};
    const sourceRates = res?.data?.rates || {};
    const supportedCoins = Object.values(Constants.DUCATUSCORE_SUPPORTED_COINS);

    for (const coin of supportedCoins) {
      const coinRate = Number(sourceRates[coin.toUpperCase()]);
      if (!coinRate) continue;

      const rates: Rate[] = [];
      for (const fiat of Defaults.FIAT_CURRENCIES) {
        const fiatRate = Number(sourceRates[fiat.code]);
        if (!fiatRate) continue;

        rates.push({
          code: fiat.code,
          value: fiatRate / coinRate
        });
      }

      if (rates.length) {
        ratesByCoin[coin] = rates;
      }
    }

    return ratesByCoin;
  }
};
