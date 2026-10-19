import { IValidation } from '..';
const Ducatuscore = require('@ducatuscore/lib');

export class BtcValidation implements IValidation {
  validateAddress(network: string, address: string): boolean {
    const Address = Ducatuscore.Address;
    // Regular Address: try Bitcoin
    return Address.isValid(address, network);
  }

  validateUri(addressUri: string): boolean {
    // Check if the input is a valid uri or address
    const URI = Ducatuscore.URI;
    // Bip21 uri
    return URI.isValid(addressUri);
  }
}
