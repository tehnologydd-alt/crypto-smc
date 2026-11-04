export interface AssetInfo {
  symbol: string;
  base: string;
  quote: string;
  name: string;
  network: string;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
}

export interface ExchangeData {
  name: 'Binance' | 'Bybit';
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  orderBook: {
    topBids: OrderBookLevel[];
    topAsks: OrderBookLevel[];
  };
  status: string;
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  levelLow: number;
  levelHigh: number;
  strength: number;
  label: string;
  mitigated: boolean;
  time?: number;
}

export interface SMCData {
  orderBlocks: OrderBlock[];
  supportLevels: number[];
  resistanceLevels: number[];
  marketStructure: string;
  fvg?: {
    present: boolean;
    type?: 'bullish' | 'bearish';
    bottom?: number;
    top?: number;
    description?: string;
  };
  discountZone: { min: number; max: number };
  premiumZone: { min: number; max: number };
}

export interface PriceSnapshot {
  timestamp: number;
  symbol: string;
  asset: AssetInfo;
  exchanges: {
    binance: ExchangeData;
    bybit: ExchangeData;
  };
  comparison: {
    spreadAbsolute: number;
    spreadPercent: number;
    cheaperExchange: 'Binance' | 'Bybit';
    arbitragePossible: boolean;
  };
  klinesSummary?: {
    count: number;
    candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  };
  smc: SMCData;
}

export interface WhaleAlert {
  id: string;
  time: number;
  amountFormatted: string;
  usdValue: number;
  from: string;
  to: string;
  type: string;
  category: 'EXCHANGE' | 'INSTITUTIONAL' | 'TREASURY' | 'COLD_STORAGE' | 'DEFI';
  entityTag: string; // e.g. "BlackRock ETF", "Tether Treasury", "Binance", "Coinbase Prime", "Satoshi 2011 Wallet", "Bybit"
  description: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

export interface WhaleRadarData {
  baseAsset: string;
  scope: string; // e.g. "Глобальный ончейн-мониторинг всех блокчейнов, фондов и бирж"
  trackedEntitiesCount: number;
  netflow24h: {
    binance: { outflowUsd: number; inflowUsd: number; net: string };
    bybit: { outflowUsd: number; inflowUsd: number; net: string };
    coinbase: { outflowUsd: number; inflowUsd: number; net: string };
    okx: { outflowUsd: number; inflowUsd: number; net: string };
    kraken: { outflowUsd: number; inflowUsd: number; net: string };
    totalGlobalExchangeNetflow: { outflowUsd: number; inflowUsd: number; net: string };
  };
  onchainAvailable?: boolean;
  etfInstitutionalFlow24h: {
    blackRockIsharesUsd: number;
    fidelityUsd: number;
    coinbasePrimeUsd: number;
    netInstitutionalFlowUsd: number;
  } | null;
  whaleDominanceIndex: number;
  sentimentWhale: string;
  recentAlerts: WhaleAlert[];
  summaryRu: string;
}

export interface SentimentData {
  fearAndGreedAvailable?: boolean;
  socialDataAvailable?: boolean;
  asset: string;
  fearAndGreed: {
    value: number;
    classification: string;
    timestamp: number;
  };
  mlModelMetrics: {
    name: string;
    sentimentScore: number;
    classification: string;
    sentimentDistribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
    socialVolumeSpikes: {
      twitterX: string;
      reddit: string;
      telegramAlpha: string;
    };
    viralKeywords: string[];
    divergenceDetected: boolean;
    summaryRu: string;
  };
}

export interface AISignalResponse {
  signal: {
    direction: 'LONG' | 'SHORT' | 'WAIT';
    entryPrice: number;
    entryZone: string;
    stopLoss: number;
    stopLossPercent: number;
    takeProfit1: number;
    takeProfit1Percent: number;
    takeProfit2: number;
    takeProfit2Percent: number;
    takeProfit3: number;
    takeProfit3Percent: number;
    riskRewardRatio: string;
    winProbability: number;
    riskLevel: 'Низкий' | 'Умеренный' | 'Повышенный';
    orderBlockTarget: string;
    validationRationale: string;
  };
  agents: {
    smcAgent: {
      name: string;
      verdict: string;
      keyFindings: string[];
      score: number;
    };
    whaleAgent: {
      name: string;
      verdict: string;
      keyFindings: string[];
      score: number;
    };
    sentimentAgent: {
      name: string;
      verdict: string;
      keyFindings: string[];
      score: number;
    };
    chiefArbiter: {
      name: string;
      verdict: string;
      executionPlan: string;
      consensusConfidence: number;
    };
  };
}
