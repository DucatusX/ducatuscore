'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var ducatuscore = require('@ducatuscore/lib-cash');
var BufferUtil = ducatuscore.util.buffer;

/**
 * A message in response to a version message.
 * @extends Message
 * @constructor
 */
function VerackMessage(arg, options) {
  Message.call(this, options);
  this.command = 'verack';
}
inherits(VerackMessage, Message);

VerackMessage.prototype.setPayload = function() {};

VerackMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = VerackMessage;
