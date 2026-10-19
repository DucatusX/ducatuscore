# Ducatuscore P2P Cash

**The peer-to-peer networking protocol for BCH.**

`ducatuscore-p2p-cash` adds Bitcoin Cash protocol support for Ducatuscore.

See the main ducatuscore repo

## Getting Started

```sh
npm install @ducatuscore/p2p-cash
```

In order to connect to the Bitcoin Cash network, you'll need to know the IP address of at least one node of the network, or use [Pool](./docs/pool.md) to discover peers using a DNS seed.

```javascript
var Peer = require('@ducatuscore/p2p-cash').Peer;

var peer = new Peer({ host: '127.0.0.1' });

peer.on('ready', function() {
  // peer info
  console.log(peer.version, peer.subversion, peer.bestHeight);
});
peer.on('disconnect', function() {
  console.log('connection closed');
});
peer.connect();
```

Then, you can get information from other peers by using:

```javascript
// handle events
peer.on('inv', function(message) {
  // message.inventory[]
});
peer.on('tx', function(message) {
  // message.transaction
});
```

Take a look at this [guide](./docs/peer.md) on the usage of the `Peer` class.
