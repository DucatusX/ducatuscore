'use strict';

var _ = require('lodash');
var async = require('async');
var chai = require('chai');
var mongodb = require('mongodb');
var should = chai.should();
var { ChainService } = require('../../ts_build/lib/chain');


describe('Chain DUCX', function() {
 
  it('should transform addresses to the db', function() {

    let x = {address: '0x01'};
    ChainService.addressToStorageTransform('ducx', 'abc', x);
    x.address.should.equal('0x01:abc');
  });

  it('should transform addresses from the db', function() {

    let x = {address: '0x01:dfg'};
    ChainService.addressFromStorageTransform('ducx', 'dfg', x);
    x.address.should.equal('0x01');
  });

});

