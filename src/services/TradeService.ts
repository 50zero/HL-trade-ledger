import { IDataSource } from '../datasources/types';
import { CacheManager } from '../cache/CacheManager';
import { BuilderFilter } from './BuilderFilter';
import { RawFill, NormalizedFill, TradesQueryParams, TradesResponse } from '../types';

/**
 * Service for fetching and normalizing trade data.
 */
export class TradeService {
  constructor(
    private readonly dataSource: IDataSource,
    private readonly cache: CacheManager,
    private readonly builderFilter: BuilderFilter
  ) {}

  /**
   * Get normalized trades for a user.
   */
  async getTrades(params: TradesQueryParams): Promise<TradesResponse> {
    const fromMs = params.fromMs ?? 0;
    const toMs = params.toMs ?? Date.now();

    // Fetch fills (with caching)
    const fills = await this.cache.getFills(
      params.user,
      params.coin,
      fromMs,
      toMs,
      () => this.dataSource.getUserFills({
        user: params.user,
        startTimeMs: fromMs,
        endTimeMs: toMs,
        coin: params.coin,
      })
    );

    // Filter by time range (in case cache returned broader range)
    let filteredFills = fills.filter(
      f => f.time >= fromMs && f.time <= toMs
    );

    // Apply builder-only filter if requested
    if (params.builderOnly) {
      filteredFills = this.builderFilter.filterBuilderFills(filteredFills);
    }

    // Collapse fills to unique trades if requested
    if (params.collapseBy) {
      const key = params.collapseBy;
      const seen = new Set<string>();
      const sorted = [...filteredFills].sort((a, b) => a.time - b.time);
      filteredFills = sorted.filter(fill => {
        const value = fill[key];
        if (value === undefined || value === null) return true;
        const id = String(value);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }

    // Normalize fills to API response format
    const trades = filteredFills.map(fill => this.normalizeFill(fill));

    return { trades };
  }

  /**
   * Get raw fills (for internal use by other services).
   */
  async getRawFills(params: TradesQueryParams): Promise<RawFill[]> {
    const fromMs = params.fromMs ?? 0;
    const toMs = params.toMs ?? Date.now();

    const fills = await this.cache.getFills(
      params.user,
      params.coin,
      fromMs,
      toMs,
      () => this.dataSource.getUserFills({
        user: params.user,
        startTimeMs: fromMs,
        endTimeMs: toMs,
        coin: params.coin,
      })
    );

    return fills.filter(f => f.time >= fromMs && f.time <= toMs);
  }

  /**
   * Convert raw Hyperliquid fill to normalized API format.
   */
  private normalizeFill(fill: RawFill): NormalizedFill {
    const normalized: NormalizedFill = {
      timeMs: fill.time,
      coin: fill.coin,
      side: fill.side === 'B' ? 'buy' : 'sell',
      px: parseFloat(fill.px),
      sz: parseFloat(fill.sz),
      fee: parseFloat(fill.fee),
      closedPnl: parseFloat(fill.closedPnl),
    };

    const builderAddress = this.builderFilter.getBuilderAddress(fill);
    if (builderAddress) {
      normalized.builder = builderAddress;
      return normalized;
    }

    // Include builder info if builderFee exists
    if (fill.builderFee && parseFloat(fill.builderFee) > 0) {
      // Note: The actual builder address may not be exposed in public API.
      // We use a placeholder indicating builder activity.
      normalized.builder = 'builder';
    }

    return normalized;
  }
}
