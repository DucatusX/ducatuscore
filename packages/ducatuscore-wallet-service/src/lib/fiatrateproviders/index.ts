import bitpay from './bitpay';
import coinbase from './coinbase';
import ducatus from './ducatus';
// import bitstamp from './bitstamp';

export interface Rate {
  code: string
  value: number
}

export interface FiatRateProvider {
  name: string;
  url: string;
  parseFn: (res: any, coin: string) => Rate[];
}

const Providers = {
  Coinbase: coinbase,
  BitPay: bitpay,
  Ducatus: ducatus
  // Bitstamp: bitstamp, // no longer used
} as Record<string, FiatRateProvider>;

export default Providers;
