export interface AssetInfo {
  symbol: string;
  base: string;
  quote: string;
  name: string;
  network: string;
}

export interface OrderBookLevel { price: number; amount: number }
export interface ExchangeData {
  name: 'Binance' | 'Bybit';
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  orderBook: { topBids: OrderBookLevel[]; topAsks: OrderBookLevel[] };
  status: 'LIVE';
}
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface OrderBlock {
  type: 'bullish' | 'bearish'; levelLow: number; levelHigh: number;
  strength: number; label: string; mitigated: boolean; time?: number;
}
export interface SMCData {
  orderBlocks: OrderBlock[];
  supportLevels: number[];
  resistanceLevels: number[];
  marketStructure: string;
  fvg: { present: boolean; type?: 'bullish' | 'bearish'; bottom?: number; top?: number; description?: string };
  discountZone: { min: number; max: number };
  premiumZone: { min: number; max: number };
}
export interface PriceSnapshot {
  timestamp: number;
  symbol: string;
  asset: AssetInfo;
  exchanges: { binance: ExchangeData | null; bybit: ExchangeData | null };
  comparison: {
    spreadAbsolute: number | null; spreadPercent: number | null;
    cheaperExchange: 'Binance' | 'Bybit' | null;
  };
  klinesSummary: { count: number; candles: Candle[] };
  smc: SMCData | null;
}
export interface OrderWall {
  id: string;
  exchange: string;
  side: 'BID' | 'ASK';
  price: number;
  amount: number;
  usdValue: number;
}
export interface WhaleRadarData {
  symbol: string;
  timestamp: number;
  source: string;
  walls: OrderWall[];
  bidLiquidityUsd: number;
  askLiquidityUsd: number;
  imbalance: number | null;
}
export interface SentimentData {
  asset: string;
  fearAndGreed: { value: number; classification: string; timestamp: number } | null;
  marketChange24h: number;
  description: string;
}
export interface LocalAnalysis {
  symbol: string;
  timestamp: number;
  bias: 'UP' | 'DOWN' | 'NEUTRAL';
  votes: { name: string; bias: 'UP' | 'DOWN' | 'NEUTRAL'; reason: string }[];
  support: number | null;
  resistance: number | null;
  conclusion: string;
  dataStatus: string;
}
