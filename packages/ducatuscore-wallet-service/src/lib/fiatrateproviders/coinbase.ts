import { Rate } from '.';
import { Defaults } from '../common/defaults';

export default {
  name: 'Coinbase',
  url: 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
  parseFn(res, coin) {
    const rates: Rate[] = [];
    const sourceRates = res?.data?.rates || {};
    const coinRate = Number(sourceRates[coin]);

    if (!coinRate) return rates;

    for (const fiat of Defaults.FIAT_CURRENCIES) {
      const fiatRate = Number(sourceRates[fiat.code]);
      if (!fiatRate) continue;

      rates.push({
        code: fiat.code,
        value: fiatRate / coinRate
      });
    }

    return rates;
  }
};
