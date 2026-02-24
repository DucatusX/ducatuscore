import { BaseModule } from '..';
import { DUCStateProvider } from '../../providers/chain-state/duc/duc';
import { BitcoinP2PWorker } from '../bitcoin/p2p';

export default class DUCModule extends BaseModule {
  constructor(services) {
    super(services);
    services.Libs.register('DUC', '@ducatuscore/lib-duc', '@ducatuscore/p2p-duc');
    services.P2P.register('DUC', BitcoinP2PWorker);
    services.CSP.registerService('DUC', new DUCStateProvider());
  }
}
