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
      rates.push({
        code: fiat.code,
        value: 1 / coinRate
      });
    }

    return rates;
  }
};
