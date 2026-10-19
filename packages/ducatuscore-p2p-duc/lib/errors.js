'use strict';

var spec = {
  name: 'P2P',
  message: 'Internal Error on ducatuscore-p2p-duc Module {0}'
};

module.exports = require('@ducatuscore/lib-duc').errors.extend(spec);
