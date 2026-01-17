import { IDataSource } from '../datasources/types';
import { CacheManager } from '../cache/CacheManager';
import { BuilderFilter } from './BuilderFilter';
import { TradeService } from './TradeService';
import {
  RawFill,
  PositionState,
  PositionsQueryParams,
  PositionsResponse,
} from '../types';

/**
 * Service for reconstructing position history from fills.
 */
export class PositionService {
  constructor(
    private readonly dataSource: IDataSource,
    private readonly cache: CacheManager,
    private readonly builderFilter: BuilderFilter,
    private readonly tradeService: TradeService
  ) {}

  /**
   * Get position history for a user/coin.
   * Reconstructs position states from fills using average cost method.
   */
  async getPositionHistory(
    params: PositionsQueryParams
  ): Promise<PositionsResponse> {
    const fromMs = params.fromMs ?? 0;
    const toMs = params.toMs ?? Date.now();
    const includePrior = params.includePrior ?? true;
    const fillStartMs = includePrior ? 0 : fromMs;

    // Fetch all fills (including before fromMs to build initial state)
    const fills = await this.tradeService.getRawFills({
      user: params.user,
      coin: params.coin,
      fromMs: fillStartMs,
      toMs: toMs,
    });

    // If no coin specified, get all unique coins
    const coins = params.coin
      ? [params.coin.toUpperCase()]
      : [...new Set(fills.map(f => f.coin.toUpperCase()))];

    const allPositions: PositionState[] = [];

    for (const coin of coins) {
      const coinFills = fills.filter(
        f => f.coin.toUpperCase() === coin
      );

      const positions = this.reconstructPositionHistory(
        coinFills,
        coin,
        fromMs,
        toMs,
        params.builderOnly ?? false
      );

      allPositions.push(...positions);
    }

    // Sort by time
    allPositions.sort((a, b) => a.timeMs - b.timeMs);

    return { positions: allPositions };
  }

  /**
   * Reconstruct position history from fills.
   * Uses average cost method for entry price calculation.
   */
  private reconstructPositionHistory(
    fills: RawFill[],
    coin: string,
    fromMs: number,
    toMs: number,
    builderOnly: boolean
  ): PositionState[] {
    const states: PositionState[] = [];

    // Sort fills by time
    const sortedFills = [...fills].sort((a, b) => a.time - b.time);

    // Position tracking
    let currentSize = 0;
    let avgEntryPx = 0;
    let totalCost = 0;

    // Taint tracking per lifecycle
    let hasBuilderFills = false;
    let hasNonBuilderFills = false;

    for (const fill of sortedFills) {
      // Skip fills after toMs
      if (fill.time > toMs) break;

      // Track builder activity
      const isBuilderFill = this.builderFilter.isBuilderFill(fill);
      if (isBuilderFill) hasBuilderFills = true;
      else hasNonBuilderFills = true;

      // Calculate position change
      const fillSize = parseFloat(fill.sz);
      const fillPrice = parseFloat(fill.px);
      const fillSigned = fill.side === 'B' ? fillSize : -fillSize;

      // In builderOnly mode, only builder fills affect the position
      const includeInPosition = !builderOnly || isBuilderFill;

      if (includeInPosition) {
        const prevSize = currentSize;
        const newSize = currentSize + fillSigned;

        // Calculate new average entry price
        if (prevSize === 0) {
          // Opening new position
          avgEntryPx = fillPrice;
          totalCost = Math.abs(newSize) * avgEntryPx;
        } else if (Math.sign(prevSize) === Math.sign(fillSigned)) {
          // Adding to position: weighted average
          const prevCost = Math.abs(prevSize) * avgEntryPx;
          const addCost = Math.abs(fillSigned) * fillPrice;
          totalCost = prevCost + addCost;
          avgEntryPx = Math.abs(newSize) > 0 ? totalCost / Math.abs(newSize) : 0;
        } else if (Math.abs(fillSigned) > Math.abs(prevSize)) {
          // Position flip: reset entry to fill price for remaining
          avgEntryPx = fillPrice;
          totalCost = Math.abs(newSize) * avgEntryPx;
        }
        // Reducing position: entry price unchanged

        currentSize = newSize;

        // Record state if within query range
        if (fill.time >= fromMs) {
          const tainted = builderOnly && hasBuilderFills && hasNonBuilderFills;

          states.push({
            timeMs: fill.time,
            coin,
            netSize: currentSize,
            avgEntryPx: avgEntryPx,
            tainted,
          });
        }

        // If position closed, reset taint tracking for next lifecycle
        if (newSize === 0) {
          hasBuilderFills = false;
          hasNonBuilderFills = false;
        }
      }
    }

    return states;
  }

  /**
   * Get current position for a user/coin (from clearinghouse state).
   */
  async getCurrentPosition(user: string, coin?: string) {
    const state = await this.cache.getClearinghouseState(
      user,
      () => this.dataSource.getClearinghouseState(user)
    );

    if (coin) {
      const position = state.assetPositions.find(
        p => p.position.coin.toUpperCase() === coin.toUpperCase()
      );

      return position
        ? {
            coin: position.position.coin,
            netSize: parseFloat(position.position.szi),
            avgEntryPx: parseFloat(position.position.entryPx),
            unrealizedPnl: parseFloat(position.position.unrealizedPnl),
          }
        : null;
    }

    return state.assetPositions.map(p => ({
      coin: p.position.coin,
      netSize: parseFloat(p.position.szi),
      avgEntryPx: parseFloat(p.position.entryPx),
      unrealizedPnl: parseFloat(p.position.unrealizedPnl),
    }));
  }
}
