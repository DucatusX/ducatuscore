import { AbstractDucatuscoreLibDeriver } from '../btc';
const DucatuscoreLibCash = require('@ducatuscore/lib-cash');
export class BchDeriver extends AbstractDucatuscoreLibDeriver {
  ducatuscoreLib = DucatuscoreLibCash;
  deriveAddress(network, pubKey, addressIndex, isChange) {
    const xpub = new this.ducatuscoreLib.HDPublicKey(pubKey, network);
    const changeNum = isChange ? 1 : 0;
    const path = `m/${changeNum}/${addressIndex}`;
    return this.ducatuscoreLib.Address(xpub.derive(path).publicKey, network).toString(true);
  }

  derivePrivateKey(network, xPriv, addressIndex, isChange) {
    const xpriv = new this.ducatuscoreLib.HDPrivateKey(xPriv, network);
    const changeNum = isChange ? 1 : 0;
    const path = `m/${changeNum}/${addressIndex}`;
    const privKey = xpriv.deriveChild(path).privateKey;
    const pubKey = privKey.publicKey;
    const address = this.ducatuscoreLib.Address(pubKey, network).toString(true);
    return { address, privKey: privKey.toString(), pubKey: pubKey.toString() };
  }
}
