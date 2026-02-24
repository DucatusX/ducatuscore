import { Deriver } from '@ducatuscore/crypto';
import _ from 'lodash';
import { ChainService } from '../chain/index';
import { Common } from '../common';
import { AddressManager } from './addressmanager';

const $ = require('preconditions').singleton();
const Constants = Common.Constants,
  Defaults = Common.Defaults,
  Utils = Common.Utils;

export interface IAddress {
  version: string;
  createdOn: number;
  address: string;
  walletId: string;
  isChange: boolean;
  isEscrow: boolean;
  path: string;
  publicKeys: string[];
  coin: string;
  chain: string;
  network: string;
  type: string;
  hasActivity: boolean;
  beRegistered: boolean;
}

export class Address {
  version: string;
  createdOn: number;
  address: string;
  walletId: string;
  isChange: boolean;
  isEscrow: boolean;
  path: string;
  publicKeys: string[];
  coin: string;
  chain: string;
  network: string;
  type: string;
  hasActivity: boolean;
  beRegistered: boolean;

  static Ducatuscore = {
    btc: require('@ducatuscore/lib'),
    bch: require('@ducatuscore/lib-cash'),
    duc: require('@ducatuscore/lib-duc')
  };

  static create(opts) {
    opts = opts || {};

    const x = new Address();

    opts.chain = opts.chain || ChainService.getChain(opts.coin); // getChain -> backwards compatibility
    $.checkArgument(Utils.checkValueInCollection(opts.chain, Constants.CHAINS));

    x.version = '1.0.0';
    x.createdOn = Math.floor(Date.now() / 1000);
    x.address = opts.address;
    x.walletId = opts.walletId;
    x.isChange = opts.isChange;
    x.isEscrow = opts.isEscrow;
    x.path = opts.path;
    x.publicKeys = opts.publicKeys;
    x.coin = opts.coin;
    x.chain = opts.chain;
    x.network = Address.Ducatuscore[opts.chain]
      ? Address.Ducatuscore[opts.chain].Address(x.address).toObject().network
      : opts.network;
    x.type = opts.type || Constants.SCRIPT_TYPES.P2SH;
    x.hasActivity = undefined;
    x.beRegistered = null;
    return x;
  }

  static fromObj(obj) {
    const x = new Address();

    x.version = obj.version;
    x.createdOn = obj.createdOn;
    x.address = obj.address;
    x.walletId = obj.walletId;
    x.coin = obj.coin || Defaults.COIN;
    x.chain = obj.chain || ChainService.getChain(x.coin);
    x.network = obj.network;
    x.isChange = obj.isChange;
    x.isEscrow = obj.isEscrow;
    x.path = obj.path;
    x.publicKeys = obj.publicKeys;
    x.type = obj.type || Constants.SCRIPT_TYPES.P2SH;
    x.hasActivity = obj.hasActivity;
    x.beRegistered = obj.beRegistered;
    return x;
  }

  static _deriveAddress(scriptType, publicKeyRing, path, m, chain, network, noNativeCashAddr, escrowInputs?) {
    $.checkArgument(Utils.checkValueInCollection(scriptType, Constants.SCRIPT_TYPES));

    let publicKeys = _.map(publicKeyRing, item => {
      const xpub = Address.Ducatuscore[chain]
        ? new Address.Ducatuscore[chain].HDPublicKey(item.xPubKey)
        : new Address.Ducatuscore.btc.HDPublicKey(item.xPubKey);
      return xpub.deriveChild(path).publicKey;
    });

    let ducatuscoreAddress;
    switch (scriptType) {
      case Constants.SCRIPT_TYPES.P2WSH:
        const nestedWitness = false;
        ducatuscoreAddress = Address.Ducatuscore[chain].Address.createMultisig(
          publicKeys,
          m,
          network,
          nestedWitness,
          'witnessscripthash'
        );
        break;
      case Constants.SCRIPT_TYPES.P2SH:
        if (escrowInputs) {
          var xpub = new Address.Ducatuscore[chain].HDPublicKey(publicKeyRing[0].xPubKey);
          const inputPublicKeys = escrowInputs.map(input => xpub.deriveChild(input.path).publicKey);
          ducatuscoreAddress = Address.Ducatuscore[chain].Address.createEscrow(inputPublicKeys, publicKeys[0], network);
          publicKeys = [publicKeys[0], ...inputPublicKeys];
        } else {
          ducatuscoreAddress = Address.Ducatuscore[chain].Address.createMultisig(publicKeys, m, network);
        }
        break;
      case Constants.SCRIPT_TYPES.P2WPKH:
        ducatuscoreAddress = Address.Ducatuscore[chain].Address.fromPublicKey(
          publicKeys[0],
          network,
          'witnesspubkeyhash'
        );
        break;
      case Constants.SCRIPT_TYPES.P2PKH:
        $.checkState(
          _.isArray(publicKeys) && publicKeys.length == 1,
          'Failed state: publicKeys length < 1 or publicKeys not an array at <_deriveAddress()>'
        );

        if (Address.Ducatuscore[chain]) {
          ducatuscoreAddress = Address.Ducatuscore[chain].Address.fromPublicKey(publicKeys[0], network);
        } else {
          const { addressIndex, isChange } = new AddressManager().parseDerivationPath(path);
          const [{ xPubKey }] = publicKeyRing;
          ducatuscoreAddress = Deriver.deriveAddress(chain.toUpperCase(), network, xPubKey, addressIndex, isChange);
        }
        break;
    }

    let addrStr = ducatuscoreAddress.toString(true);
    if (noNativeCashAddr && chain == 'bch') {
      addrStr = ducatuscoreAddress.toLegacyAddress();
    }

    return {
      // dws still use legacy addresses for BCH
      address: addrStr,
      path,
      publicKeys: _.invokeMap(publicKeys, 'toString')
    };
  }

  // noNativeCashAddr only for testing
  static derive(
    walletId,
    scriptType,
    publicKeyRing,
    path,
    m,
    coin,
    network,
    isChange,
    chain,
    noNativeCashAddr = false,
    escrowInputs?
  ) {
    const raw = Address._deriveAddress(
      scriptType,
      publicKeyRing,
      path,
      m,
      chain || ChainService.getChain(coin), // getChain -> backwards compatibility
      network,
      noNativeCashAddr,
      escrowInputs
    );
    return Address.create(
      _.extend(raw, {
        coin,
        chain,
        network,
        walletId,
        type: scriptType,
        isChange,
        isEscrow: !!escrowInputs
      })
    );
  }
}
