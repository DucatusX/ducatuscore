import { IDeriver } from '..';
const DucatuscoreLib = require('@ducatuscore/lib');

export abstract class AbstractDucatuscoreLibDeriver implements IDeriver {
  public abstract ducatuscoreLib;

  deriveAddress(network, pubKey, addressIndex, isChange) {
    const xpub = new this.ducatuscoreLib.HDPublicKey(pubKey, network);
    const changeNum = isChange ? 1 : 0;
    const path = `m/${changeNum}/${addressIndex}`;
    return this.ducatuscoreLib.Address(xpub.derive(path).publicKey, network).toString();
  }

  derivePrivateKey(network, xPriv, addressIndex, isChange) {
    const xpriv = new this.ducatuscoreLib.HDPrivateKey(xPriv, network);
    const changeNum = isChange ? 1 : 0;
    const path = `m/${changeNum}/${addressIndex}`;
    const privKey = xpriv.deriveChild(path).privateKey;
    const pubKey = privKey.publicKey;
    const address = this.ducatuscoreLib.Address(pubKey, network).toString();
    return { address, privKey: privKey.toString(), pubKey: pubKey.toString() };
  }
}
export class BtcDeriver extends AbstractDucatuscoreLibDeriver {
  ducatuscoreLib = DucatuscoreLib;
}
