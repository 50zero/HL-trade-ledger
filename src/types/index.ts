// Raw fill data from Hyperliquid API
export interface RawFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A'; // B=Buy, A=Ask(Sell)
  time: number;
  closedPnl: string;
  fee: string;
  feeToken: string;
  builder?: { b: string; f: number } | string;
  builderFee?: string;
  hash: string;
  oid: number;
  tid: number;
  startPosition: string;
  dir: string;
  crossed: boolean;
}

// Normalized fill for API responses
export interface NormalizedFill {
  timeMs: number;
  coin: string;
  side: 'buy' | 'sell';
  px: number;
  sz: number;
  fee: number;
  closedPnl: number;
  builder?: string;
}

// Position state at a point in time
export interface PositionState {
  timeMs: number;
  coin: string;
  netSize: number;
  avgEntryPx: number;
  tainted: boolean;
}

// Clearinghouse state from Hyperliquid API
export interface AssetPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    leverage: {
      type: string;
      value: number;
      rawUsd: string;
    };
    liquidationPx: string | null;
    marginUsed: string;
    maxTradeSzs: [string, string];
  };
  type: string;
}

export interface MarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface ClearinghouseState {
  assetPositions: AssetPosition[];
  marginSummary: MarginSummary;
  crossMarginSummary: MarginSummary;
  withdrawable: string;
  time: number;
}

// PnL calculation result
export interface PnlResult {
  realizedPnl: number;
  returnPct: number;
  feesPaid: number;
  tradeCount: number;
  tainted: boolean;
  effectiveCapital: number;
}

// Leaderboard entry
export interface LeaderboardEntry {
  rank: number;
  user: string;
  metricValue: number;
  tradeCount: number;
  tainted: boolean;
}

// Query parameters
export interface FillsQuery {
  user: string;
  startTimeMs?: number;
  endTimeMs?: number;
  coin?: string;
}

export interface TradesQueryParams {
  user: string;
  coin?: string;
  fromMs?: number;
  toMs?: number;
  builderOnly?: boolean;
  collapseBy?: 'hash' | 'oid' | 'tid';
}

export interface PositionsQueryParams {
  user: string;
  coin?: string;
  fromMs?: number;
  toMs?: number;
  builderOnly?: boolean;
  includePrior?: boolean;
}

export interface PnlQueryParams {
  user: string;
  coin?: string;
  fromMs?: number;
  toMs?: number;
  builderOnly?: boolean;
  maxStartCapital?: number;
}

export interface LeaderboardQueryParams {
  coin?: string;
  fromMs?: number;
  toMs?: number;
  metric: 'volume' | 'pnl' | 'returnPct';
  builderOnly?: boolean;
  maxStartCapital?: number;
  limit?: number;
}

// API response types
export interface TradesResponse {
  trades: NormalizedFill[];
}

export interface PositionsResponse {
  positions: PositionState[];
}

export interface PnlResponse extends PnlResult {}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  generatedAt: number;
}

export interface UsersResponse {
  users: string[];
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  datasource: string;
  timestamp: number;
}
