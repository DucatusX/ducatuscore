import { Storage } from '../lib/storage';
import cron from 'node-cron';
import wallets from './wallets.json';
import deposits from './deposits.json';
import { promisify } from 'util';
import { ethers } from 'ethers';
import { getNodeConfig } from '../lib/config/config';
import { Web3 } from '@ducatus/ducatuscore-crypto';
import { tokenAbi, tokenAddress } from '../duc-cron-sender/config';
import { IChainConfig, IEVMNetworkConfig } from '../lib/config/types/Config';
import { DucConvertRequest } from '../lib/model/duc-convert-request';

const config = require('../config');
const storeConfig = config.storageOpts;

interface IWallet {
  address: string;
  value: number;
}

const balanceByAddress: { [address: string]: ethers.types.BigNumber } = {};
const depositsByAddress: { [address: string]: ethers.types.BigNumber } = {};

function normalizeData() {
  (wallets as IWallet[]).forEach(({ address, value }) => {
    balanceByAddress[address] = ethers.utils.bigNumberify(`${value || 0}`);
  });
  (deposits as IWallet[]).forEach(({ address, value }) => {
    depositsByAddress[address] = ethers.utils.bigNumberify(`${value || 0}`);
  });
}

normalizeData();

const db = new Storage();

const dbConnect = promisify(db.connect.bind(db)) as (opts: any) => Promise<void>;
const dbDisconnect = promisify(db.disconnect.bind(db)) as () => Promise<void>;
const getPendingRequests = promisify(db.getNotCompletedDucConvertRequests.bind(db)) as () => Promise<
  DucConvertRequest[]
>;
const fetchAddresses = promisify(db.fetchAddresses.bind(db)) as (walletId: string) => Promise<{ address: string }[]>;
const markAsCompleted = promisify(db.markDucConvertRequestAsCompleted.bind(db)) as (walletId: string) => Promise<void>;

const peerData = ((getNodeConfig() as unknown) as IChainConfig<IEVMNetworkConfig>)?.chains['DUCX'].mainnet.providers[1];
const rpcUrl = peerData
  ? `${peerData.protocol ?? 'https'}://${peerData.host}${peerData.port ? `:${peerData.port}` : ''}`
  : null;
console.log('Try connect to', rpcUrl);

if (!rpcUrl) throw new Error('RPC URL for DUCX not found in config');

const provider = new Web3.providers.HttpProvider(rpcUrl);
const web3 = new Web3(provider);

// Контракт DUCX
const contract = new web3.eth.Contract(tokenAbi as any, tokenAddress);

function signTx(tx, { to, data, gas, gasPrice }) {
  return tx; // TODO: call service signer
}

const RETRY_COUNT = 5;
async function mintTokens(address: string, amount: ethers.types.BigNumber) {
  if (!Web3.utils.isAddress(address)) throw new Error(`Invalid address: ${address}`);
  if (amount.lte(0)) throw new Error('Amount must be > 0');

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      console.log(`Mint attempt ${attempt} to ${address}, amount ${amount.toString()}`);
      const tx = contract.methods.mint(address, amount);

      const gasLimit = await tx.estimateGas();
      console.log('Estimated gas limit:', gasLimit);

      const gasPrice = await web3.eth.getGasPrice();

      const signedTx = await signTx(tx, {
        to: tokenAddress,
        data: tx.encodeABI(),
        gas: gasLimit,
        gasPrice
      });

      // const signedTx = await minterWallet.signTransaction({
      //   to: tokenAddress,
      //   data: tx.encodeABI(),
      //   gas: gasLimit,
      //   gasPrice
      // });

      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      if (receipt.status) {
        console.log(`Mint tx success: ${receipt.transactionHash}`);
        return receipt.transactionHash;
      } else {
        throw new Error(`Mint tx failed on-chain: ${receipt.transactionHash}`);
      }
    } catch (err) {
      console.warn(`Mint error (attempt ${attempt}):`, err.message || err);
      if (attempt === RETRY_COUNT) throw err;
      // backoff
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
    }
  }
}

function getAmountForAddress(address: string) {
  const balance = balanceByAddress[address] ?? ethers.utils.bigNumberify(0);
  const deposit = depositsByAddress[address] ?? ethers.utils.bigNumberify(0);
  return balance.add(deposit);
}

let isTaskRunning = false;
async function weeklyTask() {
  try {
    if (isTaskRunning) return;
    isTaskRunning = true;
    await dbConnect(storeConfig);
    const requests = await getPendingRequests();

    console.log('Requests to process:', requests.length);

    for (const { walletId, ducxAddress } of requests) {
      const ducAddresses = await fetchAddresses(walletId);
      console.log(`Processing wallet ${walletId}`);

      let amount = ethers.utils.bigNumberify(0);

      for (const { address } of ducAddresses) {
        amount = amount.add(getAmountForAddress(address));
      }

      if (amount.gt(0)) await mintTokens(ducxAddress, amount);

      await markAsCompleted(walletId);

      console.log(`Marked request for ${walletId} as completed`);
    }

    console.log('Weekly task completed');
    await dbDisconnect();
    isTaskRunning = false;
  } catch (error) {
    console.error('Error in weeklyTask:', error);
    setTimeout(weeklyTask, 60000); // retry after 1 minute
  }
}

// каждый понедельник в 12:00 - '0 12 * * 1'
// каждые 30 секунд - '*/30 * * * * *'
cron.schedule('*/30 * * * * *', weeklyTask, { timezone: 'Europe/Moscow' });
