import { Storage } from '../lib/storage';
import cron from 'node-cron';
import wallets from './wallets.json';
import deposits from './deposits.json';
import { promisify } from 'util';
import { ethers } from 'ethers';
import { getNodeConfig } from '../lib/config/config';
import { Web3 } from '@ducatus/ducatuscore-crypto';
import { contractAbi, contractAddress, NETWORK_TYPE, signerAddress, signerUrl } from '../duc-cron-sender/config';
import { IChainConfig, IEVMNetworkConfig } from '../lib/config/types/Config';
import { DucConvertRequest } from '../lib/model/duc-convert-request';
import readline from 'readline';

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
    balanceByAddress[address] = (balanceByAddress[address] ?? ethers.utils.bigNumberify(0)).add(
      ethers.utils.bigNumberify(`${value || 0}`)
    );
  });
  (deposits as IWallet[]).forEach(({ address, value }) => {
    depositsByAddress[address] = (depositsByAddress[address] ?? ethers.utils.bigNumberify(0)).add(
      ethers.utils.bigNumberify(`${value || 0}`)
    );
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
const markAsCompleted = promisify(db.markDucConvertRequestsAsCompleted.bind(db)) as (
  walletIds: string[]
) => Promise<void>;

const peerData = ((getNodeConfig() as unknown) as IChainConfig<IEVMNetworkConfig>)?.chains['DUCX']?.[NETWORK_TYPE]
  ?.providers[1];
if (!peerData) throw new Error(`DUCX ${NETWORK_TYPE} config not found`);
const rpcUrl = peerData
  ? `${peerData.protocol ?? 'https'}://${peerData.host}${peerData.port ? `:${peerData.port}` : ''}`
  : null;
console.log('Try connect to', rpcUrl);

if (!rpcUrl) throw new Error('RPC URL for DUCX not found in config');

const provider = new Web3.providers.HttpProvider(rpcUrl);
const web3 = new Web3(provider);

// Контракт bridge DUCX
const contract = new web3.eth.Contract(contractAbi as any, contractAddress);

async function signTx({
  value,
  nonce,
  chainId,
  to,
  data,
  gasLimit,
  gasPrice
}: {
  value: string;
  nonce: number;
  chainId: string;
  to: string;
  data: string;
  gasLimit: number;
  gasPrice: string;
}) {
  const body = JSON.stringify({ value, chainId, to, data, gasLimit, gasPrice, nonce });
  const response = await fetch(signerUrl + '/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  const { raw_tx_hex: signedTx } = await response.json();
  return signedTx;
}

function getAmountForAddress(address: string) {
  const balance = balanceByAddress[address] ?? ethers.utils.bigNumberify(0);
  const deposit = depositsByAddress[address] ?? ethers.utils.bigNumberify(0);
  // console.log(`Amounts for address ${address}: balance: ${balance}, deposit: ${deposit}`);
  return balance.add(deposit);
}

const BATCH_SIZE = 50;
const RETRY_COUNT = 5;

async function multisendTokens(addresses: string[], amounts: ethers.types.BigNumber[]) {
  if (addresses.length !== amounts.length) throw new Error('Addresses and amounts length mismatch');
  if (addresses.length === 0) return;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      console.log(`Multisend attempt ${attempt} for ${addresses.length} addresses`);

      const tx = contract.methods.multisend(
        addresses,
        amounts.map(a => a.toString())
      );
      const gasLimit = await tx.estimateGas({ from: signerAddress });
      const gasPrice = await web3.eth.getGasPrice();
      const CHAIN_ID = '26482';
      const nonce = await web3.eth.getTransactionCount(signerAddress, 'pending');
      console.log('Estimated gas limit:', gasLimit, 'price:', gasPrice);

      const signedTx = await signTx({
        value: '0',
        nonce,
        to: contractAddress,
        data: tx.encodeABI(),
        gasLimit,
        gasPrice,
        chainId: CHAIN_ID
      });

      const receipt = await web3.eth.sendSignedTransaction(signedTx);

      if (receipt.status) {
        console.log(`✅ Multisend tx success: ${receipt.transactionHash}`);
        return receipt.transactionHash;
      } else {
        throw new Error(`Multisend failed on-chain: ${receipt.transactionHash}`);
      }
    } catch (err) {
      console.warn(`⚠️ Multisend error (attempt ${attempt}):`, err);
      if (attempt === RETRY_COUNT) throw err;
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
    }
  }
}

let isTaskRunning = false;
async function weeklyTask() {
  try {
    if (isTaskRunning) return;
    isTaskRunning = true;
    await dbConnect(storeConfig);
    const requests = await getPendingRequests();

    console.log('Requests to process:', requests.length);
    const ducxAddresses: string[] = [];
    const totalAmounts: ethers.types.BigNumber[] = [];
    const walletIds: string[] = [];

    for (const { walletId, ducxAddress } of requests) {
      const ducAddresses = await fetchAddresses(walletId);
      let totalAmount = ethers.utils.bigNumberify(0);

      for (const { address } of ducAddresses) {
        totalAmount = totalAmount.add(getAmountForAddress(address));
      }

      if (totalAmount.gt(0)) {
        ducxAddresses.push(ducxAddress);
        totalAmounts.push(totalAmount);
        walletIds.push(walletId);
      } else {
        await markAsCompleted([walletId]);
        console.log(`✅ Mark ${walletId} as completed`);
      }
    }

    console.log(`Prepared ${ducxAddresses.length} recipients for multisend`);

    for (let i = 0; i < ducxAddresses.length; i += BATCH_SIZE) {
      const batchAddresses = ducxAddresses.slice(i, i + BATCH_SIZE);
      const batchAmounts = totalAmounts.slice(i, i + BATCH_SIZE);
      const batchWalletIds = walletIds.slice(i, i + BATCH_SIZE);

      await multisendTokens(batchAddresses, batchAmounts);

      await markAsCompleted(batchWalletIds);
      for (const walletId of batchWalletIds) {
        console.log(`✅ Mark ${walletId} as completed`);
      }
    }

    console.log('Weekly multisend task completed');
    await dbDisconnect();
    isTaskRunning = false;
  } catch (error) {
    console.error('Error in weeklyTask:', error);
    isTaskRunning = false;
    setTimeout(weeklyTask, 60000); // повторная попытка через 1 минуту
  }
}

// каждую среду в 13:00 (МСК) - '0 13 * * 3'
cron.schedule('0 13 * * 3', weeklyTask, { timezone: 'Europe/Moscow' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const commands = {
  ducsend: () => console.log('testttt)')
};

rl.on('line', line => {
  const [cmd, ...args] = line.trim().split(' ');
  const fn = commands[cmd];
  if (fn) fn(...args);
  else console.log('Unknown command');
  rl.prompt();
});
