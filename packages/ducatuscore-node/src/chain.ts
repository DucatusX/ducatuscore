module.exports = {
  BTC: {
    lib: require('@ducatuscore/lib'),
    p2p: require('@ducatuscore/p2p')
  },
  BCH: {
    lib: require('@ducatuscore/lib-cash'),
    p2p: require('@ducatuscore/p2p-cash')
  },
  DUC: {
    lib: require('@ducatuscore/lib-duc'),
    p2p: require('@ducatuscore/p2p-duc')
  }
};
