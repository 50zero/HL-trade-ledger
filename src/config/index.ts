export type DataSourceType = 'hyperliquid' | 'insilico-hl' | 'hyperserve';

export interface CacheConfig {
  fillsTtlMs: number;
  clearinghouseTtlMs: number;
}

export interface AppConfig {
  port: number;
  targetBuilder: string | null;
  datasourceType: DataSourceType;
  cache: CacheConfig;
  maxStartCapital: number;
  logLevel: string;
  hyperliquidBaseUrl: string;
}

export function loadConfig(): AppConfig {
  const targetBuilder = process.env.TARGET_BUILDER?.toLowerCase() || null;

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    targetBuilder,
    datasourceType: (process.env.DATASOURCE_TYPE as DataSourceType) || 'hyperliquid',
    cache: {
      fillsTtlMs: parseInt(process.env.CACHE_FILLS_TTL_MS || '60000', 10),
      clearinghouseTtlMs: parseInt(process.env.CACHE_CLEARINGHOUSE_TTL_MS || '5000', 10),
    },
    maxStartCapital: parseFloat(process.env.MAX_START_CAPITAL || '1000000'),
    logLevel: process.env.LOG_LEVEL || 'info',
    hyperliquidBaseUrl: process.env.HYPERLIQUID_BASE_URL || 'https://api.hyperliquid.xyz',
  };
}

// Singleton config instance
let configInstance: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
