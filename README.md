# Ducatuscore monorepo

### Infrastructure to build Bitcoin and blockchain-based applications for the next generation of financial technology.

## Dependencies

- node js: v22.12.0
- yarn: v1.22.22
- mongo: v5.0

## Required configurations

- .env
- ducatuscore.config.json

## Installation

- ```yarn install```
- ```yarn compile```

## Development

- ```yarn dev:node```
- ```yarn dev:dws```

## Usage on the server

- ```make start```
- ```make stop```
- ```make logs-node```
- ```make logs-dws```

## NPM publish

- For authentication: ```npm set "//registry.npmjs.org/:_authToken=$NPM_TOKEN"```
- For publish: ```yarn lerna:publish```

## Troubleshooting

- If an error occurred with node-gyp, install the dependencies: https://www.npmjs.com/package/node-gyp and restart pc

- > Mongo: E11000 duplicate key error collection:

  ```js
  use dws

  db.addresses.aggregate([
  {
    $group: {
      _id: { address: "$address", coin: "$coin" },
      count: { $sum: 1 },
      duplicates: { $addToSet: "$_id" }
    }
  },
  {
    $match: {
      count: { $gt: 1 }
    }
  }
  ]).forEach(function(doc) {
  doc.duplicates.shift(); // Keep one document, remove others
  db.addresses.remove({ _id: { $in: doc.duplicates } });
  });
  ```

## Applications

- [Ducatuscore Node](packages/ducatuscore-node) - A full node with extended capabilities using ducatuscore-node Core
- [Ducatuscore Wallet](packages/ducatuscore-wallet) - A command-line based wallet client
- [Ducatuscore Wallet Client](packages/ducatuscore-wallet-client-rev) - A client for the wallet service
- [Ducatuscore Wallet Service](packages/ducatuscore-wallet-service-rev) - A multisig HD service for wallets
- [Insight](packages/insight) - A blockchain explorer web user interface

## Libraries

- [Ducatuscore Lib](packages/ducatuscore-lib) - A powerful JavaScript library for Ducatus
- [Ducatuscore Lib Cash](packages/ducatuscore-lib-cash) - A powerful JavaScript library for Bitcoin Cash
- [Ducatuscore Mnemonic](packages/ducatuscore-mnemonic) - Implements mnemonic code for generating deterministic keys
- [Ducatuscore P2P](packages/ducatuscore-p2p) - The peer-to-peer networking protocol for Ducatus
- [Ducatuscore P2P Cash](packages/ducatuscore-p2p-cash) - The peer-to-peer networking protocol for Bitcoin Cash
- [Ducatuscore Crypto](packages/ducatuscore-crypto) - A coin-agnostic wallet library for creating transactions, signing, and address derivation

## Extras

- [Ducatuscore Build](packages/ducatuscore-build) - A helper to add tasks to gulp
- [Ducatuscore Client](packages/ducatuscore-client) - A helper to create a wallet using the ducatuscore-v8 infrastructure
