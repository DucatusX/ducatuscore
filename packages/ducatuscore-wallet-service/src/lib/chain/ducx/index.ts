import { Transactions, Validation } from '@ducatuscore/crypto';
import { Web3 } from '@ducatuscore/crypto';
import _ from 'lodash';
import { IAddress } from 'src/lib/model/address';
import { IChain } from '..';
import { Common } from '../../common';
import { ClientError } from '../../errors/clienterror';
import logger from '../../logger';
const { toBN } = Web3.utils;

const Constants = Common.Constants;
const Defaults = Common.Defaults;
const Errors = require('../../errors/errordefinitions');

export class DucxChain implements IChain {
  /**
   * Converts Ducatuscore Balance Response.
   * @param {Object} ducatuscoreBalance - { unconfirmed, confirmed, balance }
   * @param {Number} locked - Sum of txp.amount
   * @returns {Object} balance - Total amount & locked amount.
   */
  private convertDucatuscoreBalance(ducatuscoreBalance, locked) {
    const { unconfirmed, confirmed, balance } = ducatuscoreBalance;
    // we ASUME all locked as confirmed, for ETH.
    const convertedBalance = {
      totalAmount: balance,
      totalConfirmedAmount: confirmed,
      lockedAmount: locked,
      lockedConfirmedAmount: locked,
      availableAmount: balance - locked,
      availableConfirmedAmount: confirmed - locked,
      byAddress: []
    };
    return convertedBalance;
  }

  getSizeSafetyMargin() {
    return 0;
  }

  getInputSizeSafetyMargin() {
    return 0;
  }

  notifyConfirmations() {
    return false;
  }

  supportsMultisig() {
    return false;
  }

  getWalletBalance(server, wallet, opts, cb) {
    const bc = server._getBlockchainExplorer(wallet.chain || wallet.coin, wallet.network);

    if (opts.tokenAddress) {
      const isSwapContract = Defaults.DUCX_CONTRACTS.includes(opts.tokenAddress);
      if (!isSwapContract) {
        wallet.tokenAddress = opts.tokenAddress;
      }
    }

    bc.getBalance(wallet, (err, balance) => {
      if (err) {
        return cb(err);
      }
      server.getPendingTxs(opts, (err, txps) => {
        if (err) return cb(err);
        // Do not lock ducx multisig amount
        const lockedSum = _.sumBy(txps, 'amount') || 0;
        const convertedBalance = this.convertDucatuscoreBalance(balance, lockedSum);
        server.storage.fetchAddresses(server.walletId, (err, addresses: IAddress[]) => {
          if (err) return cb(err);
          if (addresses.length > 0) {
            const byAddress = [
              {
                address: addresses[0].address,
                path: addresses[0].path,
                amount: convertedBalance.totalAmount
              }
            ];
            convertedBalance.byAddress = byAddress;
          }
          return cb(null, convertedBalance);
        });
      });
    });
  }

  getWalletSendMaxInfo(server, wallet, opts, cb) {
    server.getBalance({}, (err, balance) => {
      if (err) return cb(err);
      const { totalAmount, availableAmount } = balance;
      let fee = opts.feePerKb * Defaults.MIN_DUCX_GAS_LIMIT;
      return cb(null, {
        utxosBelowFee: 0,
        amountBelowFee: 0,
        amount: availableAmount - fee,
        feePerKb: opts.feePerKb,
        fee
      });
    });
  }

  getDustAmountValue() {
    return 0;
  }

  getTransactionCount(server, wallet, from) {
    return new Promise((resolve, reject) => {
      server._getTransactionCount(wallet, from, (err, nonce) => {
        if (err) return reject(err);
        return resolve(nonce);
      });
    });
  }

  getChangeAddress() {}

  checkDust(output, opts) {}

  getFee(server, wallet, opts) {
    return new Promise(resolve => {
      server._getFeePerKb(wallet, opts, async (err, inFeePerKb) => {
        let feePerKb = inFeePerKb;
        let gasPrice = inFeePerKb;
        const { from } = opts;
        const { coin, network } = wallet;
        let inGasLimit = 0; // Per recepient gas limit
        let gasLimit = 0; // Gas limit for all recepients. used for contract interactions that rollup recepients
        let fee = 0;
        const defaultGasLimit = this.getDefaultGasLimit(opts);
        let outputAddresses = []; // Parameter for MuliSend contract
        let outputAmounts = []; // Parameter for MuliSend contract
        let totalValue = toBN(0); // Parameter for MuliSend contract

        for (let output of opts.outputs) {
          if (opts.multiSendContractAddress) {
            outputAddresses.push(output.toAddress);
            outputAmounts.push(toBN(output.amount));
            if (!opts.tokenAddress) {
              totalValue = totalValue.add(toBN(output.amount));
            }
            inGasLimit += output.gasLimit ? output.gasLimit : defaultGasLimit;
            continue;
          } else if (!output.gasLimit) {
            try {
              const to = opts.tokenAddress
                ? opts.tokenAddress
                : opts.multisigContractAddress
                ? opts.multisigContractAddress
                : output.toAddress;
              const value = opts.tokenAddress || opts.multisigContractAddress ? 0 : output.amount;
              inGasLimit = await server.estimateGas({
                coin,
                network,
                from,
                to,
                value,
                data: output.data,
                gasPrice
              });
              output.gasLimit = inGasLimit || defaultGasLimit;
            } catch (err) {
              output.gasLimit = defaultGasLimit;
            }
          } else {
            inGasLimit = output.gasLimit;
          }
          if (_.isNumber(opts.fee)) {
            // This is used for sendmax
            gasPrice = feePerKb = Number((opts.fee / (inGasLimit || defaultGasLimit)).toFixed());
          }
          gasLimit = inGasLimit || defaultGasLimit;
          fee += feePerKb * gasLimit;
        }

        return resolve({ feePerKb, gasPrice, gasLimit, fee });
      });
    });
  }

  getDucatuscoreTx(txp, opts = { signed: true }) {
    const { data, outputs, tokenAddress, tokenId } = txp;
    const isERC20 = tokenAddress;
    const isERC721 = isERC20 && tokenId;

    let chain = isERC721 ? 'DUCXERC721' : isERC20 ? 'DUCXERC20' : 'DUCX';

    const recipients = outputs.map(output => {
      return {
        amount: output.amount,
        address: output.toAddress,
        data: output.data,
        gasLimit: output.gasLimit
      };
    });
    // Backwards compatibility DWC <= 8.9.0
    if (data) {
      recipients[0].data = data;
    }
    const unsignedTxs = [];

    for (let index = 0; index < recipients.length; index++) {
      let params = {
        ...recipients[index],
        nonce: Number(txp.nonce) + Number(index),
        recipients: [recipients[index]]
      };
      unsignedTxs.push(Transactions.create({ ...txp, chain, ...params }));
    }

    let tx = {
      uncheckedSerialize: () => unsignedTxs,
      txid: () => txp.txid,
      toObject: () => {
        let ret = _.clone(txp);
        ret.outputs[0].satoshis = ret.outputs[0].amount;
        return ret;
      },
      getFee: () => {
        return txp.fee;
      },
      getChangeOutput: () => null
    };

    if (opts.signed) {
      const sigs = txp.getCurrentSignatures();
      sigs.forEach(x => {
        this.addSignaturesToDucatuscoreTx(tx, txp.inputs, txp.inputPaths, x.signatures, x.xpub);
      });
    }

    return tx;
  }

  getDefaultGasLimit(opts) {
    if (opts.isContractCall) {
      return Defaults.DEFAULT_DUCX_CONTRACT_GAS_LIMIT;
    } else if (opts.tokenAddress) {
      return Defaults.DEFAULT_DUCX_ERC20_GAS_LIMIT;
    }

    return Defaults.DEFAULT_DUCX_GAS_LIMIT;
  }

  convertFeePerKb(p, feePerKb) {
    return [p, feePerKb];
  }

  checkTx(txp) {
    try {
      const tx = this.getDucatuscoreTx(txp);
    } catch (ex) {
      logger.debug('Error building Ducatuscore transaction: %o', ex);
      return ex;
    }

    return null;
  }

  checkTxUTXOs(server, txp, opts, cb) {
    return cb();
  }

  selectTxInputs(server, txp, wallet, opts, cb) {
    server.getBalance({ wallet, tokenAddress: opts.tokenAddress }, (err, balance) => {
      if (err) return cb(err);

      const { totalAmount, availableAmount } = balance;

      const txpTotalAmount = txp.getTotalAmount(opts);

      if (totalAmount < txpTotalAmount) {
        return cb(Errors.INSUFFICIENT_FUNDS);
      } else if (availableAmount < txpTotalAmount) {
        return cb(Errors.LOCKED_FUNDS);
      } else {
        if (opts.tokenAddress || opts.multisigContractAddress) {
          // ETH linked wallet balance
          server.getBalance({}, (err, ethBalance) => {
            if (err) return cb(err);
            const { totalAmount, availableAmount } = ethBalance;
            if (totalAmount < txp.fee) {
              return cb(this.getInsufficientFeeError(txp));
            } else if (availableAmount < txp.fee) {
              return cb(this.getLockedFeeError(txp));
            } else {
              return cb(this.checkTx(txp));
            }
          });
        } else if (availableAmount - txp.fee < txpTotalAmount) {
          return cb(
            new ClientError(
              Errors.codes.INSUFFICIENT_FUNDS_FOR_FEE,
              `${Errors.INSUFFICIENT_FUNDS_FOR_FEE.message}. RequiredFee: ${txp.fee}`,
              {
                requiredFee: txp.fee
              }
            )
          );
        } else {
          return cb(this.checkTx(txp));
        }
      }
    });
  }

  getInsufficientFeeError(txp) {
    return new ClientError(
      Errors.codes.INSUFFICIENT_DUCX_FEE,
      `${Errors.INSUFFICIENT_DUCX_FEE.message}. RequiredFee: ${txp.fee}`,
      {
        requiredFee: txp.fee
      }
    );
  }

  getLockedFeeError(txp) {
    return new ClientError(Errors.codes.LOCKED_DUCX_FEE, `${Errors.LOCKED_DUCX_FEE.message}. RequiredFee: ${txp.fee}`, {
      requiredFee: txp.fee
    });
  }

  checkUtxos(opts) {}

  checkValidTxAmount(output): boolean {
    try {
      if (
        output.amount == null ||
        output.amount < 0 ||
        isNaN(output.amount) ||
        Web3.utils.toBN(output.amount).toString() !== output.amount.toString()
      ) {
        throw new Error('output.amount is not a valid value: ' + output.amount);
      }
      return true;
    } catch (err) {
      logger.warn(`Invalid output amount (${output.amount}) in checkValidTxAmount: $o`, err);
      return false;
    }
  }

  isUTXOChain() {
    return false;
  }
  isSingleAddress() {
    return true;
  }

  addressFromStorageTransform(network, address): void {
    if (network != 'livenet') {
      const x = address.address.indexOf(':' + network);
      if (x >= 0) {
        address.address = address.address.substr(0, x);
      }
    }
  }

  addressToStorageTransform(network, address): void {
    if (network != 'livenet') address.address += ':' + network;
  }

  addSignaturesToDucatuscoreTx(tx, inputs, inputPaths, signatures, xpub) {
    if (signatures.length === 0) {
      throw new Error('Signatures Required');
    }

    const chain = 'DUCX'; // TODO use lowercase always to avoid confusion
    const unsignedTxs = tx.uncheckedSerialize();
    const signedTxs = [];
    for (let index = 0; index < signatures.length; index++) {
      const signed = Transactions.applySignature({
        chain,
        tx: unsignedTxs[index],
        signature: signatures[index]
      });
      signedTxs.push(signed);

      // ducatuscore users id for txid...
      tx.id = Transactions.getHash({ tx: signed, chain });
    }
    tx.uncheckedSerialize = () => signedTxs;
  }

  validateAddress(wallet, inaddr, opts) {
    const chain = 'ducx';
    const isValidTo = Validation.validateAddress(chain, wallet.network, inaddr);
    if (!isValidTo) {
      throw Errors.INVALID_ADDRESS;
    }
    const isValidFrom = Validation.validateAddress(chain, wallet.network, opts.from);
    if (!isValidFrom) {
      throw Errors.INVALID_ADDRESS;
    }
    return;
  }

  onCoin(coin) {
    return null;
  }

  onTx(tx) {
    // TODO: Multisig ERC20 - Internal txs ¿?
    let tokenAddress;
    let multisigContractAddress;
    let address;
    let amount;
    if (tx.abiType && tx.abiType.type === 'ERC20') {
      tokenAddress = tx.to;
      address = Web3.utils.toChecksumAddress(tx.abiType.params[0].value);
      amount = tx.abiType.params[1].value;
    } else {
      address = tx.to;
      amount = tx.value;
    }
    return {
      txid: tx.txid,
      out: {
        address,
        amount,
        tokenAddress,
        multisigContractAddress
      }
    };
  }
}
