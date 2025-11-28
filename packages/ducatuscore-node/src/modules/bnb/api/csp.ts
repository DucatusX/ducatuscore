import request from 'request';
import { BaseEVMStateProvider } from '../../../providers/chain-state/evm/api/csp';
import { IBlock } from '../../../types/Block';
import { StreamWalletTransactionsParams } from '../../../types/namespaces/ChainStateProvider';

export class BNBStateProvider extends BaseEVMStateProvider {
  constructor() {
    super('BNB');
  }

  async getLocalTip({ chain, network }) {
    const { web3 } = await this.getWeb3(network);
    const latestBlock = await web3.eth.getBlock('latest');
    const localTip: IBlock = {
      ...latestBlock,
      height: latestBlock.number,
      processed: true,
      chain,
      network,
      time: new Date(latestBlock.timestamp),
      timeNormalized: new Date(latestBlock.timestamp),
      previousBlockHash: latestBlock.parentHash,
      nextBlockHash: '',
      transactionCount: latestBlock.transactions.length,
      reward: 0
    };
    return localTip;
  }

  private static moralisRotatorIdx = 0;
  async streamWalletTransactions(params: StreamWalletTransactionsParams) {
    const { wallet } = params;
    const walletAddress = (await this.getWalletAddresses(wallet._id!)).map(waddres => waddres.address)[0];

    const moralisApiKeys = process.env.MORALIS_API_KEYS?.split(',') || [];
    const moralisApiKey = moralisApiKeys[BNBStateProvider.moralisRotatorIdx % moralisApiKeys.length];
    if (BNBStateProvider.moralisRotatorIdx === moralisApiKeys.length - 1) BNBStateProvider.moralisRotatorIdx = 0;
    else BNBStateProvider.moralisRotatorIdx += 1;

    const options = {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-api-key': moralisApiKey
      }
    };

    request(
      `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/history?chain=bsc&order=DESC`,
      options,
      (err, _res, body) => {
        if (err) return console.error(err);
        params.res.send(JSON.parse(body));
      }
    );
  }
}

export const BNB = new BNBStateProvider();
