# ducatuscore-wallet-client

The _official_ client library for [ducatuscore-wallet-service](https://google.com).

## Description

This package communicates with DWS [Ducatuscore wallet service](https://google.com) using the REST API. All REST endpoints are wrapped as simple async methods. All relevant responses from DWS are checked independently by the peers, thus the importance of using this library when talking to a third party DWS instance.

See [Ducatuscore-wallet] (https://google.com) for a simple CLI wallet implementation that relays on DWS and uses ducatuscore-wallet-client.

## Get Started

You can start using ducatuscore-wallet-client via [NPM](https://www.npmjs.com/package/@ducatuscore/wallet-client): by running `npm install @ducatuscore/wallet-client` from your console.

## Example

Start your own local [Ducatuscore wallet service](https://google.com) instance. In this example we assume you have `ducatuscore-wallet-service` running on your `localhost:3232`.

Then create two files `irene.js` and `tomas.js` with the content below:

### **irene.js**

```javascript
var Client = require('@ducatuscore/wallet-client');

var fs = require('fs');
var DWS_INSTANCE_URL = 'https://localhost:3232/';

var client = new Client({
  baseUrl: DWS_INSTANCE_URL,
  verbose: false,
});

client.createWallet('My Wallet', 'Irene', 2, 2, { network: 'testnet' }, function (err, secret) {
  if (err) {
    console.log('error: ', err);
    return;
  }
  // Handle err
  console.log('Wallet Created. Share this secret with your copayers: ' + secret);
  fs.writeFileSync('irene.dat', client.export());
});
```

### **tomas.js**

```javascript
var Client = require('@ducatuscore/wallet-client');

var fs = require('fs');
var DWS_INSTANCE_URL = 'https://localhost:3232';

var secret = process.argv[2];
if (!secret) {
  console.log('./tomas.js <Secret>');

  process.exit(0);
}

var client = new Client({
  baseUrl: DWS_INSTANCE_URL,
  verbose: false,
});

client.joinWallet(secret, 'Tomas', {}, function (err, wallet) {
  if (err) {
    console.log('error: ', err);
    return;
  }

  console.log('Joined ' + wallet.name + '!');
  fs.writeFileSync('tomas.dat', client.export());

  client.openWallet(function (err, ret) {
    if (err) {
      console.log('error: ', err);
      return;
    }
    console.log('\n\n** Wallet Info', ret); //TODO

    console.log('\n\nCreating first address:', ret); //TODO
    if (ret.wallet.status == 'complete') {
      client.createAddress({}, function (err, addr) {
        if (err) {
          console.log('error: ', err);
          return;
        }

        console.log('\nReturn:', addr);
      });
    }
  });
});
```

Install `@ducatuscore/wallet-client` before start:

```sh
npm i @ducatuscore/wallet-client
```

Create a new wallet with the first script:

```sh
$ node irene.js
info Generating new keys
 Wallet Created. Share this secret with your copayers: JbTDjtUkvWS4c3mgAtJf4zKyRGzdQzZacfx2S7gRqPLcbeAWaSDEnazFJF6mKbzBvY1ZRwZCbvT
```

Join to this wallet with generated secret:

```sh
$ node tomas.js JbTDjtUkvWS4c3mgAtJf4zKyRGzdQzZacfx2S7gRqPLcbeAWaSDEnazFJF6mKbzBvY1ZRwZCbvT
Joined My Wallet!

Wallet Info: [...]

Creating first address:

Return: [...]

```
