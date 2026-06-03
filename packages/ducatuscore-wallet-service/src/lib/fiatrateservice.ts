import * as async from 'async';
import _ from 'lodash';
import * as request from 'request';
import { Common } from './common';
import logger from './logger';
import { Storage } from './storage';
import Providers, { FiatRateProvider } from './fiatrateproviders';

const $ = require('preconditions').singleton();
const Defaults = Common.Defaults;
const Constants = Common.Constants;

export class FiatRateService {
  request: request.RequestAPI<any, any, any>;
  defaultProvider: any;
  storage: Storage;
  providers = Object.values(Providers);
  providersByCoin: Record<string, string>;

  init(opts, cb) {
    opts = opts || {};

    this.request = opts.request || request;
    this.defaultProvider = opts.defaultProvider || Defaults.FIAT_RATE_PROVIDER;
    this.providersByCoin = opts.providersByCoin || {};

    async.parallel(
      [
        done => {
          if (opts.storage) {
            this.storage = opts.storage;
            done();
          } else {
            this.storage = new Storage();
            this.storage.connect(opts.storageOpts, done);
          }
        }
      ],
      err => {
        if (err) {
          logger.error('%o', err);
        }
        return cb(err);
      }
    );
  }

  startCron(opts, cb) {
    opts = opts || {};

    const interval = opts.fetchInterval || Defaults.FIAT_RATE_FETCH_INTERVAL;
    if (interval) {
      this._fetch();
      setInterval(() => {
        this._fetch();
      }, interval * 60 * 1000);
    }

    return cb();
  }

  _fetch(cb?) {
    cb = cb || function() {};
    const coins = Object.values(Constants.DUCATUSCORE_SUPPORTED_COINS);

    this.providers.forEach((provider: FiatRateProvider) => {
      if (!provider.parseFn) return cb(new Error('No parse function for provider ' + provider.name));

      this._retrieve(provider, (err, res) => {
        if (err) {
          logger.error('Error retrieving data for %o: %o', provider.name, err);
          return;
        }

        const storeRates = (coin, rates) => {
          this.storage.storeFiatRate(coin, rates, err => {
            if (err) {
              logger.error('Error storing data for %o: %o', provider.name, err);
            }
          });
        };

        coins.forEach(coin => {
          if (this.getProviderName(coin) !== provider.name) return;
          const rates = provider.parseFn(res, coin.toUpperCase());
          storeRates(coin, rates);
        });
      });
    });
  }

  _retrieve(provider, cb) {
    logger.debug(`Fetching data for ${provider.name}`);

    const ts = Date.now();

    this.request.get(
      {
        url: provider.url,
        json: true
      },
      (err, res, body) => {
        if (err) return cb(err);
        if (res.statusCode >= 400) return cb(`StatusCode: ${res.statusCode}, Response: ${JSON.stringify(body)}`);

        logger.debug(`Data for ${provider.name} fetched successfully`);

        return cb(null, body);
      }
    );
  }

  getRate(opts, cb) {
    $.shouldBeFunction(cb, 'Failed state: type error (cb not a function) at <getRate()>');

    opts = opts || {};

    const now = Date.now();
    let coin = opts.coin || 'btc';
    const provider = opts.provider || this.getProviderName(coin);
    //    const provider = opts.provider || this.defaultProvider;
    const ts = _.isNumber(opts.ts) || _.isArray(opts.ts) ? opts.ts : now;

    async.map(
      [].concat(ts),
      (ts, cb) => {
        this.storage.fetchFiatRate(coin, opts.code, ts, (err, rate) => {
          if (err) return cb(err);
          if (rate && ts - rate.ts > Defaults.FIAT_RATE_MAX_LOOK_BACK_TIME * 60 * 1000) rate = null;

          return cb(null, {
            ts: +ts,
            rate: rate ? rate.value : undefined,
            fetchedOn: rate ? rate.ts : undefined
          });
        });
      },
      (err, res: any) => {
        if (err) return cb(err);
        if (!_.isArray(ts)) res = res[0];
        return cb(null, res);
      }
    );
  }

  getRates(opts, cb) {
    $.shouldBeFunction(cb, 'Failed state: type error (cb not a function) at <getRates()>');

    opts = opts || {};

    const now = Date.now();
    const ts = opts.ts ? opts.ts : now;
    let fiatFiltered = [];
    let rates = [];

    if (opts.code) {
      fiatFiltered = _.filter(Defaults.FIAT_CURRENCIES, ['code', opts.code]);
      if (!fiatFiltered.length) return cb(opts.code + ' is not supported');
    }
    const currencies: { code: string; name: string }[] = fiatFiltered.length ? fiatFiltered : Defaults.FIAT_CURRENCIES;

    async.map(
      _.values(Constants.DUCATUSCORE_SUPPORTED_COINS),
      (coin, cb) => {
        rates[coin] = [];
        const provider = opts.provider || this.getProviderName(coin);
        async.map(
          currencies,
          (currency, cb) => {
            let c = coin.split('_')[0];
            if (coin === 'wbtc_e' || coin === 'wbtc_m') {
              logger.info('Using btc for wbtc rate.');
              c = 'btc';
            }
            this.storage.fetchFiatRate(c, currency.code, ts, (err, rate) => {
              if (err) return cb(err);
              if (rate && ts - rate.ts > Defaults.FIAT_RATE_MAX_LOOK_BACK_TIME * 60 * 1000) rate = null;
              return cb(null, {
                ts: +ts,
                rate: rate ? rate.value : undefined,
                fetchedOn: rate ? rate.ts : undefined,
                code: currency.code,
                name: currency.name
              });
            });
          },
          (err, res: any) => {
            if (err) return cb(err);
            var obj = {};
            obj[coin] = res;
            return cb(null, obj);
          }
        );
      },
      (err, res: any) => {
        if (err) return cb(err);
        return cb(null, Object.assign({}, ...res));
      }
    );
  }

  getRatesByCoin(opts, cb) {
    $.shouldBeFunction(cb, 'Failed state: type error (cb not a function) at <getRatesByCoin()>');

    let { coin, code } = opts;
    const ts = opts.ts || Date.now();
    const provider = opts.provider || this.getProviderName(coin);

    if (Constants.DUCATUSCORE_USD_STABLECOINS[coin.toUpperCase()]) {
      return this.getRatesForStablecoin({ code: 'USD', ts }, cb);
    }

    if (Constants.DUCATUSCORE_EUR_STABLECOINS[coin.toUpperCase()]) {
      return this.getRatesForStablecoin({ code: 'EUR', ts }, cb);
    }

    let fiatFiltered = [];

    if (code) {
      fiatFiltered = _.filter(Defaults.FIAT_CURRENCIES, ['code', opts.code]);
      if (!fiatFiltered.length) return cb(opts.code + ' is not supported');
    }

    const currencies: { code: string; name: string }[] = fiatFiltered.length ? fiatFiltered : Defaults.FIAT_CURRENCIES;

    async.map(
      currencies,
      (currency, cb) => {
        if (coin === 'wbtc') {
          logger.info('Using btc for wbtc rate.');
          coin = 'btc';
        }
        this.storage.fetchFiatRate(coin, currency.code, ts, (err, rate) => {
          if (err) return cb(err);
          if (rate && ts - rate.ts > Defaults.FIAT_RATE_MAX_LOOK_BACK_TIME * 60 * 1000) rate = null;
          return cb(null, {
            ts: +ts,
            rate: rate ? rate.value : undefined,
            fetchedOn: rate ? rate.ts : undefined,
            code: currency.code,
            name: currency.name
          });
        });
      },
      cb
    );
  }

  getHistoricalRates(opts, cb) {
    $.shouldBeFunction(cb);

    opts = opts || {};
    const historicalRates = {};

    // Oldest date in timestamp range in epoch number ex. 24 hours ago
    const now = Date.now() - Defaults.FIAT_RATE_FETCH_INTERVAL * 60 * 1000;
    const ts = _.isNumber(opts.ts) ? opts.ts : now;
    const coins = ['btc', 'bch', 'eth', 'duc', 'ducx', 'xrp', 'bnb', 'shib', 'ape'];

    async.map(
      coins,
      (coin: string, cb) => {
        const provider = opts.provider || this.getProviderName(coin);
        this.storage.fetchHistoricalRates(coin, opts.code, ts, (err, rates) => {
          if (err) return cb(err);
          if (!rates) return cb();
          for (const rate of rates) {
            rate.rate = rate.value;
            delete rate['_id'];
            delete rate['code'];
            delete rate['value'];
            delete rate['coin'];
          }
          historicalRates[coin] = rates;
          return cb(null, historicalRates);
        });
      },
      (err, res: any) => {
        if (err) return cb(err);
        return cb(null, res[0]);
      }
    );
  }

  /**
   * @description calculates fiat rates for a stablecoin
   * @param {String} [opts.coin] crypto to base the fiat rates on (defaults to 'btc')
   * @param {String} opts.code code for fiat currency that the stablecoin is pegged to
   * @param {Number} [opts.ts] timestamp (defaults to now)
   * @param {Function} cb
   */
  getRatesForStablecoin(opts, cb) {
    $.shouldBeFunction(cb, 'Failed state: type error (cb not a function) at <getRatesForStablecoin()>');

    const { coin = 'btc', code } = opts;
    const ts = opts.ts || Date.now();

    this.getRatesByCoin({ coin, ts }, (err, rates) => {
      if (err) return cb(err);

      const fiatRate = rates.find(rate => rate.code === code);
      if (!fiatRate || !fiatRate.rate) return cb(null, []);

      return cb(
        null,
        rates.map(({ rate, ...obj }) => ({
          ...obj,
          rate: parseFloat((rate / fiatRate.rate).toFixed(2))
        }))
      );
    });
  }

  private getProviderName(coin: string) {
    const normalizedCoin = this.normalizeCoin(coin);
    return this.providersByCoin[normalizedCoin] || this.defaultProvider;
  }

  private normalizeCoin(coin: string) {
    if (!coin) return coin;
    if (coin === 'wbtc_e' || coin === 'wbtc_m') return 'btc';
    if (coin === 'wbtc') return 'btc';
    return coin.split('_')[0];
  }
}
