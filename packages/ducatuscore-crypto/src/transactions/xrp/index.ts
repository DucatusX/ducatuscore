import { createHash } from 'crypto';
import { encode, decode, encodeForSigning } from 'ripple-binary-codec';
import { Key } from '../../derivation';
import { sign } from 'ripple-keypairs';

enum HashPrefix {
  livenet = 0x54584e00,
  mainnet = 0x54584e00,
  testnet = 0x73747800
}

interface Transaction {
  TransactionType: string;
  Account: string;
  Destination?: string;
  Amount?: string;
  Fee: string;
  Sequence: number;
  Flags?: number;
  InvoiceID?: string;
  DestinationTag?: number;
}

export class XRPTxProvider {
  create(params: {
    recipients: Array<{ address: string; amount: string; tag?: number }>;
    tag?: number;
    from: string;
    invoiceID?: string;
    fee: number;
    feeRate: number;
    nonce: number;
    type?: string;
    flags?: number;
  }): string {
    const { recipients, tag, from, invoiceID, fee, nonce, type, flags } = params;
    const { address, amount } = recipients[0];
    const destinationTag = recipients[0]?.tag || tag;

    const txType = (type || 'payment').toLowerCase();
    let txJSON: Transaction;

    switch (txType) {
      case 'payment':
        txJSON = {
          TransactionType: 'Payment',
          Account: from,
          Destination: address,
          Amount: amount.toString(),
          Fee: fee.toString(),
          Sequence: nonce,
          Flags: flags ?? 2147483648
        };
        if (invoiceID) txJSON.InvoiceID = invoiceID;
        if (destinationTag) txJSON.DestinationTag = destinationTag;
        break;

      case 'accountset':
        txJSON = {
          TransactionType: 'AccountSet',
          Account: from,
          Fee: fee.toString(),
          Sequence: nonce,
          Flags: flags ?? 0
        };
        break;

      case 'accountdelete':
        txJSON = {
          TransactionType: 'AccountDelete',
          Account: from,
          Destination: address,
          Fee: fee.toString(),
          Sequence: nonce
        };
        if (destinationTag) txJSON.DestinationTag = destinationTag;
        break;

      default:
        throw new Error(`Unsupported transaction type: ${txType}`);
    }

    return encode(txJSON);
  }

  getSignatureObject(params: { tx: string; key: Key }) {
    const { tx, key } = params;
    const txJSON = decode(tx);

    txJSON.SigningPubKey = key.pubKey.toUpperCase();

    const signingData = encodeForSigning(txJSON);
    const signature = sign(signingData, key.privKey.toUpperCase());

    txJSON.TxnSignature = signature;

    const signedTransaction = encode(txJSON);

    const hash = this.getHash(params);

    return {
      signedTransaction,
      hash
    };
  }

  getSignature(params: { tx: string; key: Key }): string {
    const { signedTransaction } = this.getSignatureObject(params);
    return signedTransaction;
  }

  getHash(params: { tx: string; network?: string }): string {
    const { tx, network = 'mainnet' } = params;
    const prefix = HashPrefix[network].toString(16).toUpperCase();
    return this.sha512Half(prefix + tx);
  }

  applySignature(params: { tx: string; signature: string }): string {
    return params.signature;
  }

  sign(params: { tx: string; key: Key }): string {
    const signature = this.getSignature(params);
    return this.applySignature({ tx: params.tx, signature });
  }

  sha512Half(hex: string): string {
    return createHash('sha512')
      .update(Buffer.from(hex, 'hex'))
      .digest('hex')
      .toUpperCase()
      .slice(0, 64);
  }
}
