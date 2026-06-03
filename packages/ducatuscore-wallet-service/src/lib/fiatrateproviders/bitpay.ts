import { Rate, RatesByCoin } from '.';
import { Constants } from '../common/constants';
import { Defaults } from '../common/defaults';

export default {
  name: 'BitPay',
  url: 'https://bitpay.com/api/rates/',
  parseFn(res) {
    const ratesByCoin: RatesByCoin = {};
    const supportedCoins = Object.values(Constants.DUCATUSCORE_SUPPORTED_COINS);

    for (const coin of supportedCoins) {
      const coinRate = res.find(rate => rate.code === coin.toUpperCase())?.rate;
      if (!coinRate) continue;

      const rates: Rate[] = [];
      for (const fiat of Defaults.FIAT_CURRENCIES) {
        const fiatRate = res.find(rate => rate.code === fiat.code)?.rate;
        if (!fiatRate) continue;

        rates.push({
          code: fiat.code,
          value: Number(fiatRate / coinRate)
        });
      }

      if (rates.length) {
        ratesByCoin[coin] = rates;
      }
    }

    return ratesByCoin;
  }
};
