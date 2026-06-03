import { Rate, RatesByCoin } from ".";

export default {
  name: 'Ducatus',
  url: 'https://rates.ducatuscoins.com/api/v1/rates/',
  parseFn(res) {
    const ratesByCoin: RatesByCoin = {};

    for (const coinKey of Object.keys(res || {})) {
      const sourceRates = res?.[coinKey];
      if (!sourceRates || typeof sourceRates !== 'object') continue;

      const normalizedCoin = coinKey.toLowerCase();
      const rates: Rate[] = [];

      for (const code in sourceRates) {
        const value = Number(sourceRates[code]);
        if (!Number.isFinite(value)) continue;

        rates.push({
          code,
          value
        });
      }

      if (rates.length) {
        ratesByCoin[normalizedCoin] = rates;
      }
    }

    return ratesByCoin;
  }
};
