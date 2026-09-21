import { Router } from 'express';
import logger from '../../../logger';
import { DUCX } from './csp';
import { Gnosis } from './gnosis';
export const DucxRoutes = Router();

DucxRoutes.get('/api/DUCX/:network/address/:address/txs/count', async (req, res) => {
  let { address, network } = req.params;
  try {
    const nonce = await DUCX.getAccountNonce(network, address);
    res.json({ nonce });
  } catch (err) {
    logger.error('Nonce Error::%o', err);
    res.status(500).send(err);
  }
});

DucxRoutes.post('/api/DUCX/:network/gas', async (req, res) => {
  const { from, to, value, data, gasPrice, noGasBuffer } = req.body;
  const { network } = req.params;
  try {
    const gasLimit = await DUCX.estimateGas({ network, from, to, value, data, gasPrice, noGasBuffer });
    res.json(gasLimit);
  } catch (err) {
    // @ts-ignore
    if (err?.code != null) {
      // Preventable error from geth (probably due to insufficient funds or similar)
      // @ts-ignore
      res.status(400).send(err.message);
    } else {
      logger.error('Gas Error::%o', err);
      res.status(500).send(err);
    }
  }
});

DucxRoutes.get('/api/DUCX/:network/token/:tokenAddress', async (req, res) => {
  const { network, tokenAddress } = req.params;
  try {
    const tokenInfo = await DUCX.getERC20TokenInfo(network, tokenAddress);
    res.json(tokenInfo);
  } catch (err) {
    logger.error('Token Info Error::%o', err);
    res.status(500).send(err);
  }
});

DucxRoutes.get('/api/DUCX/:network/ethmultisig/info/:multisigContractAddress', async (req, res) => {
  const { network, multisigContractAddress } = req.params;
  try {
    const multisigInfo = await Gnosis.getMultisigEthInfo(network, multisigContractAddress);
    res.json(multisigInfo);
  } catch (err) {
    logger.error('Multisig Info Error::%o', err);
    res.status(500).send(err);
  }
});

DucxRoutes.get('/api/DUCX/:network/ethmultisig/:sender/instantiation/:txId', async (req, res) => {
  const { network, sender, txId } = req.params;
  try {
    const multisigInstantiationInfo = await Gnosis.getMultisigContractInstantiationInfo(network, sender, txId);
    res.json(multisigInstantiationInfo);
  } catch (err) {
    logger.error('Multisig Instantiation Error::%o', err);
    res.status(500).send(err);
  }
});

DucxRoutes.get('/api/DUCX/:network/ethmultisig/txps/:multisigContractAddress', async (req, res) => {
  const { network, multisigContractAddress } = req.params;
  try {
    const multisigTxpsInfo = await Gnosis.getMultisigTxpsInfo(network, multisigContractAddress);
    res.json(multisigTxpsInfo);
  } catch (err) {
    logger.error('Multisig Txps Error::%o', err);
    res.status(500).send(err);
  }
});

DucxRoutes.get('/api/DUCX/:network/ethmultisig/transactions/:multisigContractAddress', async (req, res) => {
  let { network, multisigContractAddress } = req.params;
  const chain = 'DUCX';
  try {
    return await Gnosis.streamGnosisWalletTransactions({
      chain,
      network,
      multisigContractAddress,
      wallet: {} as any,
      req,
      res,
      args: req.query
    });
  } catch (err) {
    logger.error('Multisig Transactions Error::%o', err);
    res.status(500).send(err);
  }
});
