# Set up to run the tests.

  1. nothing to copy: `yarn test:unit`, `yarn test:integration` and `yarn coverage` load ../../ducatuscore-test.config.json themselves (via DUCATUSCORE_CONFIG_PATH)
  2. run mongod
  3. run bitcoin-code's bitcoind (tested with version v0.19) with:
      `./bitcoind -regtest -rpcpassword=ducatuscorenodetest -rpcuser=local321 --rpcport=18332 --addresstype=legacy`
