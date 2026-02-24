# Ducatuscore Lib Cash

**A pure and powerful JavaScript Bitcoin _Cash_ library.**

## Principles

Bitcoin Cash is another powerful peer-to-peer platform for the next generation of financial technology. The decentralized nature of the Bitcoin network allows for highly resilient bitcoin infrastructure, and the developer community needs reliable, open-source tools to implement bitcoin apps and services.

## Bitcoin Cash changes

Bitcoin cash uses a different `sighash` for transaction signatures. The implementation in ducatuscore-cash has been tested against the original bitcoin-cash test vectors (see sighash.json in `/test`). `bitcoin-cash` modifications in script evaluation have not been implemented yet.

## Get Started

```sh
npm install ducatuscore-lib-cash
```

Adding Ducatuscore Cash to your app's `package.json`:

```json
"dependencies": {
    "@ducatuscore/lib-cash": "10.0.0",
    ...
}
```

## Documentation

The complete docs are hosted here: ducatuscore documentation. There's also a ducatuscore API reference available generated from the JSDocs of the project, where you'll find low-level details on each ducatuscore utility.

## Examples

- [Generate a random address](docs/examples.md#generate-a-random-address)
- [Generate a address from a SHA256 hash](docs/examples.md#generate-a-address-from-a-sha256-hash)
- [Import an address via WIF](docs/examples.md#import-an-address-via-wif)
- [Create a Transaction](docs/examples.md#create-a-transaction)
- [Sign a Bitcoin message](docs/examples.md#sign-a-bitcoin-message)
- [Verify a Bitcoin message](docs/examples.md#verify-a-bitcoin-message)
- [Create an OP RETURN transaction](docs/examples.md#create-an-op-return-transaction)
- [Create a 2-of-3 multisig P2SH address](docs/examples.md#create-a-2-of-3-multisig-p2sh-address)
- [Spend from a 2-of-2 multisig P2SH address](docs/examples.md#spend-from-a-2-of-2-multisig-p2sh-address)

## Building the Browser Bundle

To build a ducatuscore-lib full bundle for the browser:

```sh
gulp browser
```

This will generate files named `ducatuscore-lib-cash.js` and `ducatuscore-lib-cash.min.js`.

You can also use our pre-generated files, provided for each release along with a PGP signature by one of the project's maintainers.

## Development & Tests

```sh
npm install
```

Run all the tests:

```sh
gulp test
```

You can also run just the Node.js tests with `gulp test:node`, just the browser tests with `gulp test:browser`
or create a test coverage report (you can open `coverage/lcov-report/index.html` to visualize it) with `gulp coverage`.
