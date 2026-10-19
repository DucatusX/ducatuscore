# Installation

The following document is a step-by-step guide to run DWS.

## Prerequisites

Ensure MongoDB (2.6+) is installed and running. This document assumes that mongod is running at the default port 27017.
See the configuration section to configure a different host/port.

## Install DWS from NPM

Use the following steps to Install DWS from the npmjs repository and run it with defaults.

```sh
npm install @ducatuscore/wallet-service
cd @ducatuscore/wallet-service
```

To change configuration before running, see the Configuration section.

```sh
npm start
```

## Install DWS from github source

Use the following steps to Install DWS from github source and run it with defaults.

```sh
cd ducatuscore-wallet-service
npm install
```

To change configuration before running, see the Configuration section.

```sh
npm start
```

## Configuration

DWS is composed of 4 separate node services -
Message Broker - messagebroker/messagebroker.js
Blockchain Monitor - bcmonitor/bcmonitor.js (This service talks to the Blockchain Explorer service configured under blockchainExplorerOpts - see Configure blockchain service below.)
Email Service - emailservice/emailservice.js
Ducatuscore Wallet Service - dws.js

### Configure MongoDB

Example configuration for connecting to the MongoDB instance:

```javascript
  storageOpts: {
    mongoDb: {
      uri: 'mongodb://localhost:27017/dws',
    },
  }
```

### Configure Message Broker service

Example configuration for connecting to message broker service:

```javascript
  messageBrokerOpts: {
    messageBrokerServer: {
      url: 'http://localhost:3380',
    },
  }
```

### Configure blockchain service. Ducatuscore v8 is required.

Note: this service will be used by blockchain monitor service as well as by DWS itself.
An example of this configuration is:

```javascript
  blockchainExplorerOpts: {
      'btc': {
        livenet: {
            provider: 'v8',
            url: 'https://localhost:3000',
         },
        testnet: {
            provider: 'v8',
            url: 'https://localhost:3000',
         },
      },
  }
```

### Configure Email service

Example configuration for connecting to email service (using postfix):

```javascript
  emailOpts: {
    host: 'localhost',
    port: 25,
    ignoreTLS: true,
    subjectPrefix: '[Wallet Service]',
    from: 'wallet-service@some.io',
  }
```

### Enable clustering

Change `config.js` file to enable and configure clustering:

```javascript
{
  cluster: true,
  clusterInstances: 4,
}
```
