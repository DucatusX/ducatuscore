# Ducatuscore Wallet Service

**A Multisig HD Ducatuscore Wallet Service.**

## Description

Ducatuscore Wallet Service facilitates multisig HD wallets creation and operation through a (hopefully) simple and intuitive REST API.

DWS can usually be installed within minutes and accommodates all the needed infrastructure for peers in a multisig wallet to communicate and operate – with minimum server trust.

See [ducatuscore-wallet-client](https://google.com) for the _official_ client library that communicates to DWS and verifies its response. Also check [ducatuscore-wallet](https://google.com) for a simple CLI wallet implementation that relies on DWS.

DWS is been used in production enviroments for [Ducatus Wallet](https://google.com).

## Getting Started

```sh
 cd ducatuscore-wallet-service
 npm install
 npm start
```

This will launch the DWS service (with default settings) at `http://localhost:3232/dws/api`.

DWS needs mongoDB. You can configure the connection at `dws.config.js`

DWS supports SSL and Clustering. For a detailed guide on installing DWS with extra features see Installing DWS.

DWS uses by default a Request Rate Limitation to CreateWallet endpoint. If you need to modify it, check defaults.js' `Defaults.RateLimit`

## Using DWS with PM2

DWS can be used with PM2 with the provided `app.js` script:

```sh
  pm2 start app.js --name "ducatuscore-wallet-service"
```
## Using SSL

You can add your certificates at the dws.config.js using:

```json
  https: true,
  privateKeyFile: 'private.pem',
  certificateFile: 'cert.pem',
  ////// The following is only for certs which are not
  ////// trusted by nodejs 'https' by default
  ////// CAs like Verisign do not require this
  // CAinter1: '', // ex. 'COMODORSADomainValidationSecureServerCA.crt'
  // CAinter2: '', // ex. 'COMODORSAAddTrustCA.crt'
  // CAroot: '', // ex. 'AddTrustExternalCARoot.crt'
```

## TX proposal life cycle

Tx proposal need to be:

1.  First created via /v?/txproposal
    -> This will create a 'temporary' TX proposal, returning the object, but not locking the inputs
2.  Then published via /v?/txproposal/:id/publish
    -> This publish the tx proposal to all copayers, looking the inputs. The TX proposal can be `deleted` also, after been published.
3.  Then signed via /v?/txproposal/:id/signature for each copayer
4.  Then broadcasted to the p2p network via /v?/txproposal/:id/broadcast

The are plenty example creating and sending proposals in the `/test/integration` code.

## Enabling Regtest Mode for DWS and Copay

### Requirements

- ducatuscore-node running on http://localhost:3000
- dws running locally on http://localhost:3232/dws/api
- mongod running
- copay running on port: 8100

### Steps:

**ducatuscore.config.json**

1.  Add regtest to ducatuscore.config.json.

```
"regtest": {
  "chainSource": "p2p",
  "trustedPeers": [
    {
      "host": "127.0.0.1",
      "port": 20020
    }
  ],
  "rpc": {
    "host": "127.0.0.1",
    "port": 20021,
    "username": "bitpaytest",
    "password": "local321"
  }
}
```

**ducatuscore-wallet-service/dws.config.js**

1. Point testnet to http://localhost:3000 in DWS/dws.config.js and set regtestEnabled to true.

```
blockchainExplorerOpts: {
  btc: {
    livenet: {
      url: 'https://localhost:3000'
    },
    testnet: {
      // set url to http://localhost:3000 here
      url: 'http://localhost:3000',
      // set regtestEnabled to true here
      regtestEnabled: true
    }
  },
...
```

# REST API

Note: all currency amounts are in units of satoshis (1/100,000,000 of a bitcoin).

## Authentication

In order to access a wallet, clients are required to send the headers:

```sh
  x-identity
  x-signature
```

Identity is the Peer-ID, this will identify the peer and its wallet. Signature is the current request signature, using `requestSigningKey`, the `m/1/1` derivative of the Extended Private Key.

See [Ducatuscore Wallet Client](https://google.com) for implementation details.

## GET Endpoints

### `/v1/wallets/`: Get wallet information

Returns:

- Wallet object. (see [fields on the source code](https://google.com)).

### `/v1/txhistory/`: Get Wallet's transaction history

Optional Arguments:

- skip: Records to skip from the result (defaults to 0)
- limit: Total number of records to return (return all available records if not specified).

Returns:

- History of incoming and outgoing transactions of the wallet. The list is paginated using the `skip` & `limit` params. Each item has the following fields:
- action ('sent', 'received', 'moved')
- amount
- fees
- time
- addressTo
- confirmations
- proposalId
- creatorName
- message
- actions array ['createdOn', 'type', 'copayerId', 'copayerName', 'comment']

### `/v2/txproposals/`: Get Wallet's pending transaction proposals and their status

Returns:

- List of pending TX Proposals. (see [fields on the source code](https://google.com))

- Uses cashaddr without prefix for BCH

### `/v4/addresses/`: Get Wallet's main addresses (does not include change addresses)

Optional Arguments:

- ignoreMaxGap: [false] Ignore checking less that 20 unused addresses (BIP44 GAP)

### `/v1/balance/`: Get Wallet's balance

Returns:

- totalAmount: Wallet's total balance
- lockedAmount: Current balance of outstanding transaction proposals, that cannot be used on new transactions.
- availableAmount: Funds available for new proposals.
- totalConfirmedAmount: Same as totalAmount for confirmed UTXOs only.
- lockedConfirmedAmount: Same as lockedAmount for confirmed UTXOs only.
- availableConfirmedAmount: Same as availableAmount for confirmed UTXOs only.
- byAddress array ['address', 'path', 'amount']: A list of addresses holding funds.
- totalKbToSendMax: An estimation of the number of KiB required to include all available UTXOs in a tx (including unconfirmed).

### `/v1/txnotes/:txid`: Get user notes associated to the specified transaction

Returns:

- The note associated to the `txid` as a string.

### `/v1/fiatrates/:code`: Get the fiat rate for the specified ISO 4217 code

Optional Arguments:

- provider: An identifier representing the source of the rates.
- ts: The timestamp for the fiat rate (defaults to now).

Returns:

- The fiat exchange rate.

## POST Endpoints

### `/v1/wallets/`: Create a new Wallet

Required Arguments:

- name: Name of the wallet
- m: Number of required peers to sign transactions
- n: Number of total peers on the wallet
- pubKey: Wallet Creation Public key to check joining copayer's signatures (the private key is unknown by DWS and must be communicated
  by the creator peer to other peers).

Returns:

- walletId: Id of the new created wallet

### `/v1/wallets/:id/copayers/`: Join a Wallet in creation

Required Arguments:

- walletId: Id of the wallet to join
- name: Copayer Name
- xPubKey - Extended Public Key for this copayer.
- requestPubKey - Public Key used to check requests from this copayer.
- copayerSignature - Signature used by other copayers to verify that the copayer joining knows the wallet secret.

Returns:

- copayerId: Assigned ID of the copayer (to be used on x-identity header)
- wallet: Object with wallet's information

### `/v3/txproposals/`: Add a new temporary transaction proposal

Required Arguments:

- toAddress: RCPT Bitcoin address.
- amount: amount (in satoshis) of the mount proposed to be transfered
- proposalsSignature: Signature of the proposal by the creator peer, using proposalSigningKey.
- (opt) message: Encrypted private message to peers.
- (opt) feePerKb: Use an alternative fee per KB for this TX.
- (opt) excludeUnconfirmedUtxos: Do not use UTXOs of unconfirmed transactions as inputs for this TX.
- BCH addresses need to be cashaddr without prefix.

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)). `.id` is probably needed in this case.

### `/v2/txproposals/:id/publish`: Publish the previously created `temporary` tx proposal

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)).

### `/v3/addresses/`: Request a new main address from wallet . (creates an address on normal conditions)

Returns:

- Address object: (https://google.com). Note that `path` is returned so client can derive the address independently and check server's response.

### `/v1/txproposals/:id/signatures/`: Sign a transaction proposal

Required Arguments:

- signatures: All Transaction's input signatures, in order of appearance.

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)). `.status` is probably needed in this case.

### `/v1/txproposals/:id/broadcast/`: Broadcast a transaction proposal

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)). `.status` is probably needed in this case.

### `/v1/txproposals/:id/rejections`: Reject a transaction proposal

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)). `.status` is probably needed in this case.

### `/v1/addresses/scan`: Start an address scan process looking for activity.

Optional Arguments:

- includeCopayerBranches: Scan all copayer branches following BIP45 recommendation (defaults to false).

### `/v1/txconfirmations/`: Subscribe to receive push notifications when the specified transaction gets confirmed

Required Arguments:

- txid: The transaction to subscribe to.

## PUT Endpoints

### `/v1/txnotes/:txid/`: Modify a note for a tx

## DELETE Endpoints

### `/v1/txproposals/:id/`: Deletes a transaction proposal. Only the creator can delete a TX Proposal, and only if it has no other signatures or rejections

Returns:

- TX Proposal object. (see [fields on the source code](https://google.com)). `.id` is probably needed in this case.

### `/v1/txconfirmations/:txid`: Unsubscribe from transaction `txid` and no longer listen to its confirmation

# Push Notifications

Recomended to complete config.js file:

- [FCM documentation](https://firebase.google.com/docs/cloud-messaging/)
- [Apple's Notification](https://developer.apple.com/documentation/usernotifications)

## POST Endpoints

### `/v1/pushnotifications/subscriptions/`: Adds subscriptions for push notifications service at database

## DELETE Endpoints

### `/v2/pushnotifications/subscriptions/`: Remove subscriptions for push notifications service from database
