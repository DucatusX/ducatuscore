import { IValidation } from '..';
const DucatuscoreLibDuc = require('@ducatuscore/lib-duc');

export class DucValidation implements IValidation {
  validateAddress(network: string, address: string): boolean {
    const AddressCash = DucatuscoreLibDuc.Address;
    // Regular Address: try Bitcoin Cash
    return AddressCash.isValid(address, network);
  }

  validateUri(addressUri: string): boolean {
    // Check if the input is a valid uri or address
    const URI = DucatuscoreLibDuc.URI;
    // Bip21 uri
    return URI.isValid(addressUri);
  }
}
