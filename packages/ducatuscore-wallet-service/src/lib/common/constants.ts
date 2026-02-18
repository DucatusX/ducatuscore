'use strict';
import * as CWC from '@ducatus/ducatuscore-crypto';

export const Constants = {
  CHAINS: {
    BTC: 'btc',
    BCH: 'bch',
    ETH: 'eth',
    DUC: 'duc',
    DUCX: 'ducx',
    XRP: 'xrp',
    BNB: 'bnb'
  },

  DUCATUSCORE_SUPPORTED_COINS: {
    // used for rates
    BTC: 'btc',
    BCH: 'bch',
    ETH: 'eth',
    DUC: 'duc',
    DUCX: 'ducx',
    XRP: 'xrp',
    BNB: 'bnb',
    SHIB: 'shib',
    APE: 'ape',
    USDC: 'usdc',
    USDP: 'usdp',
    PAX: 'pax',
    GUSD: 'gusd',
    BUSD: 'busd',
    DAI: 'dai',
    WBTC: 'wbtc',
    EUROC: 'euroc',
    USDT: 'usdt',
    MATIC: 'matic',
    JAMASY: 'jamasy',
    NUYASA: 'nuyasa',
    SUNOBA: 'sunoba',
    DSCMED: 'dscmed',
    POG1: 'pog1',
    WDE: 'wde',
    MDXB: 'mdxb',
    'G.O.L.D.': 'g.o.l.d.',
    JWAN: 'jwan',
    TKF: 'tkf',
    'AA+': 'aa+',
    QMN: 'qmn',
    MPE: 'mpe',
    BALISOL: 'balisol',
    'X-GEN': 'x-gen',
    BULT: 'bult',
    SHGEN: 'shgen',
    SHRES: 'shres',
    SHBT: 'shbt',
    NATV: 'natv',
    SPAD: 'spad'
  },

  DUCATUSCORE_SUPPORTED_ETH_ERC20: {
    // backwards compatability
    USDC: 'usdc',
    USDP: 'usdp',
    PAX: 'pax', // backwards compatability
    GUSD: 'gusd',
    BUSD: 'busd',
    DAI: 'dai',
    WBTC: 'wbtc',
    SHIB: 'shib',
    APE: 'ape',
    EUROC: 'euroc',
    USDT: 'usdt',
    MATIC: 'matic'
  },

  DUCATUSCORE_SUPPORTED_DUCX_ERC20: {
    JAMASY: 'jamasy',
    NUYASA: 'nuyasa',
    SUNOBA: 'sunoba',
    DSCMED: 'dscmed',
    POG1: 'pog1',
    WDE: 'wde',
    MDXB: 'mdxb',
    'G.O.L.D.': 'g.o.l.d.',
    JWAN: 'jwan',
    TKF: 'tkf',
    'AA+': 'aa+',
    QMN: 'qmn',
    MPE: 'mpe',
    BALISOL: 'balisol',
    'X-GEN': 'x-gen',
    BULT: 'bult',
    SHGEN: 'shgen',
    SHRES: 'shres',
    SHBT: 'shbt',
    NATV: 'natv',
    SPAD: 'spad'
  },
  UTXO_COINS: {
    BTC: 'btc',
    BCH: 'bch',
    DUC: 'duc'
  },

  DUCATUSCORE_USD_STABLECOINS: {
    // used for rates
    USDC: 'usdc',
    USDP: 'usdp',
    PAX: 'pax',
    GUSD: 'gusd',
    BUSD: 'busd',
    DAI: 'dai',
    USDT: 'usdt'
  },

  DUCATUSCORE_EUR_STABLECOINS: {
    // used for rates
    EUROC: 'euroc'
  },

  UTXO_CHAINS: {
    BTC: 'btc',
    BCH: 'bch',
    DUC: 'duc'
  },

  EVM_CHAINS: {
    ETH: 'eth',
    DUCX: 'ducx',
    BNB: 'bnb'
  },

  NETWORKS: {
    LIVENET: 'livenet',
    TESTNET: 'testnet'
  },

  ADDRESS_FORMATS: ['copay', 'cashaddr', 'legacy', 'ducatus'],

  SCRIPT_TYPES: {
    P2SH: 'P2SH',
    P2WSH: 'P2WSH',
    P2PKH: 'P2PKH',
    P2WPKH: 'P2WPKH'
  },

  DERIVATION_STRATEGIES: {
    BIP44: 'BIP44',
    BIP45: 'BIP45'
  },

  PATHS: {
    SINGLE_ADDRESS: "m/0'/0",
    REQUEST_KEY: "m/1'/0",
    TXPROPOSAL_KEY: "m/1'/1",
    REQUEST_KEY_AUTH: 'm/2' // relative to BASE
  },

  BIP45_SHARED_INDEX: 0x80000000 - 1,

  ETH_TOKEN_OPTS: CWC.Constants.ETH_TOKEN_OPTS,
  DUCX_TOKEN_OPTS: CWC.Constants.DUCX_TOKEN_OPTS,

  DUCATUSCORE_CONTRACTS: {
    MULTISEND: 'MULTISEND'
  },

  // Number of confirmations from which tx in history will be cached
  // There is a default value in defaults.ts that applies to UTXOs
  CONFIRMATIONS_TO_START_CACHING: {
    eth: 100,
    ducx: 150,
    bnb: 100
  },

  // Individual chain settings for block throttling
  CHAIN_NEW_BLOCK_THROTTLE_TIME_SECONDS: {
    btc: { testnet: 300, livenet: 0 },
    bch: { testnet: 300, livenet: 0 },
    eth: { testnet: 300, livenet: 0 },
    ducx: { testnet: 300, livenet: 12 }, // DUCX set to 12 because blocks normally occur every 1-2 seconds
    bnb: { testnet: 300, livenet: 0 },
    xrp: { testnet: 300, livenet: 0 }
  } as { [chain: string]: { [network: string]: number } }
};

export const DUC_BLOCKCHAIN_CLOSE_DATE = Date.UTC(2025, 10, 5, 9);
export const DUC_REQUEST_PROCESSING_WEEKDAY = 3; // (0=вс, 1=пн, 2=вт, 3=ср, ...)
