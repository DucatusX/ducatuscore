export default {
  name: 'Bitstamp',
  url: 'https://www.bitstamp.net/api/ticker/',
  parseFn(raw) {
    return {
      btc: [
        {
          code: 'USD',
          value: parseFloat(raw.last)
        }
      ]
    };
  }
};
