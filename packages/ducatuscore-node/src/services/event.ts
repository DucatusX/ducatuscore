import { EventEmitter } from 'events';
import { LoggifyClass } from '../decorators/Loggify';
import logger from '../logger';
import { BlockEvent, CoinEvent, EventModel, EventStorage, TxEvent } from '../models/events';
import { exponentialBackoff } from '../utils/retry';
import { Config, ConfigService } from './config';
import { StorageService } from './storage';
import { Storage } from './storage';

type EventCursor = ReturnType<EventModel['getTxTail']>;
interface EventDoc {
  payload: BlockEvent | TxEvent | CoinEvent;
}

@LoggifyClass
export class EventService {
  txEvent = new EventEmitter();
  blockEvent = new EventEmitter();
  addressCoinEvent = new EventEmitter();
  events = new EventEmitter();
  storageService: StorageService;
  configService: ConfigService;
  eventModel: EventModel;
  stopped = false;

  constructor({ storageService = Storage, eventModel = EventStorage, configService = Config } = {}) {
    this.storageService = storageService;
    this.configService = configService;
    this.eventModel = eventModel;
    this.signalTx = this.signalTx.bind(this);
    this.signalBlock = this.signalBlock.bind(this);
    this.signalAddressCoin = this.signalAddressCoin.bind(this);
  }

  start() {
    if (this.configService.isDisabled('event')) {
      logger.info('Disabled Event Service');
      return;
    }
    logger.info('Starting Event Service');
    this.stopped = false;
    this.events.emit('start');
    if (this.storageService.connected) {
      this.wireup();
    } else {
      this.storageService.connection.on('CONNECTED', () => {
        this.wireup();
      });
    }
  }

  async stop() {
    logger.info('Stopping Event Service');
    this.stopped = true;
    this.events.emit('stop');
  }

  async wireup() {
    let lastBlockUpdate = new Date();
    let lastTxUpdate = new Date();
    let lastAddressTxUpdate = new Date();

    // Re-reads a tail every 100ms. While the database is unreachable the read fails, and instead of an
    // unhandled rejection (which stops the worker) it is retried with exponential backoff. The cursor is
    // closed in any case: it is opened with noCursorTimeout, so the server would never reap an abandoned one.
    const poll = (name: string, openTail: () => EventCursor, onEvent: (event: EventDoc) => void) => {
      let failures = 0;
      const run = async () => {
        let delay = 100;
        let cursor: EventCursor | undefined;
        try {
          cursor = openTail();
          while (!this.stopped && (await cursor.hasNext())) {
            const event = await cursor.next();
            if (event) {
              onEvent(event);
            }
          }
          failures = 0;
        } catch (err: any) {
          delay = exponentialBackoff(failures++);
          logger.error(
            `Event service: reading ${name} events failed, retrying in ${(delay / 1000).toFixed(1)}s: ${err.message}`
          );
        } finally {
          if (cursor) {
            cursor.close().catch(() => undefined);
          }
        }
        if (!this.stopped) {
          setTimeout(run, delay);
        }
      };
      run();
    };

    poll(
      'tx',
      () => this.eventModel.getTxTail(lastTxUpdate),
      event => {
        this.txEvent.emit('tx', event.payload as TxEvent);
        lastTxUpdate = new Date();
      }
    );

    poll(
      'block',
      () => this.eventModel.getBlockTail(lastBlockUpdate),
      event => {
        this.blockEvent.emit('block', event.payload as BlockEvent);
        lastBlockUpdate = new Date();
      }
    );

    poll(
      'coin',
      () => this.eventModel.getCoinTail(lastAddressTxUpdate),
      event => {
        this.addressCoinEvent.emit('coin', event.payload as CoinEvent);
        lastAddressTxUpdate = new Date();
      }
    );
  }

  async signalBlock(block: BlockEvent) {
    await this.eventModel.signalBlock(block);
  }

  async signalTx(tx: TxEvent) {
    await this.eventModel.signalTx(tx);
  }

  async signalAddressCoin(payload: CoinEvent) {
    await this.eventModel.signalAddressCoin(payload);
  }
}

export const Event = new EventService();
