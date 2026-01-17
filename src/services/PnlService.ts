import { IDataSource } from '../datasources/types';
import { CacheManager } from '../cache/CacheManager';
import { BuilderFilter } from './BuilderFilter';
import { TradeService } from './TradeService';
import { PnlQueryParams, PnlResult } from '../types';

const RETURN_PCT_CAP = 1000; // Cap return percentage at +/- 1000%

/**
 * Service for calculating PnL metrics.
 */
export class PnlService {
  private readonly defaultMaxStartCapital: number;

  constructor(
    private readonly dataSource: IDataSource,
    private readonly cache: CacheManager,
    private readonly builderFilter: BuilderFilter,
    private readonly tradeService: TradeService,
    defaultMaxStartCapital: number
  ) {
    this.defaultMaxStartCapital = defaultMaxStartCapital;
  }

  /**
   * Calculate PnL for a user within a time range.
   */
  async calculatePnl(params: PnlQueryParams): Promise<PnlResult> {
    const fromMs = params.fromMs ?? 0;
    const toMs = params.toMs ?? Date.now();
    const maxStartCapital = params.maxStartCapital ?? this.defaultMaxStartCapital;

    // Fetch fills
    const fills = await this.tradeService.getRawFills({
      user: params.user,
      coin: params.coin,
      fromMs,
      toMs,
    });

    // Track builder activity for taint detection
    let hasBuilderFills = false;
    let hasNonBuilderFills = false;

    // Calculate metrics
    let realizedPnl = 0;
    let feesPaid = 0;
    let tradeCount = 0;
    let volume = 0;

    for (const fill of fills) {
      const isBuilderFill = this.builderFilter.isBuilderFill(fill);

      if (isBuilderFill) hasBuilderFills = true;
      else hasNonBuilderFills = true;

      // In builderOnly mode, only count builder fills
      if (!params.builderOnly || isBuilderFill) {
        realizedPnl += parseFloat(fill.closedPnl);
        feesPaid += parseFloat(fill.fee);
        tradeCount++;
        volume += parseFloat(fill.px) * parseFloat(fill.sz);
      }
    }

    // Get equity at start time for return calculation
    // Note: Hyperliquid doesn't provide historical equity snapshots
    // We approximate using current equity minus PnL earned since fromMs
    const equityAtFromMs = await this.getApproximateEquityAt(
      params.user,
      fromMs,
      params.coin
    );

    // Effective capital calculation with capping
    const effectiveCapital = Math.min(
      Math.max(equityAtFromMs, 0.01), // Avoid division by zero
      maxStartCapital
    );

    // Return percentage with capping
    let returnPct = (realizedPnl / effectiveCapital) * 100;
    returnPct = Math.max(-RETURN_PCT_CAP, Math.min(RETURN_PCT_CAP, returnPct));

    const tainted = params.builderOnly === true && hasBuilderFills && hasNonBuilderFills;

    return {
      realizedPnl,
      returnPct,
      feesPaid,
      tradeCount,
      tainted,
      effectiveCapital,
    };
  }

  /**
   * Approximate equity at a historical point in time.
   *
   * Since Hyperliquid doesn't provide historical equity snapshots,
   * we estimate it by:
   * 1. Getting current equity
   * 2. Subtracting PnL earned between the target time and now
   *
   * This is an approximation and may not account for deposits/withdrawals.
   */
  private async getApproximateEquityAt(
    user: string,
    atTimeMs: number,
    coin?: string
  ): Promise<number> {
    // Get current clearinghouse state
    const currentState = await this.cache.getClearinghouseState(
      user,
      () => this.dataSource.getClearinghouseState(user)
    );

    const currentEquity = parseFloat(currentState.marginSummary.accountValue);

    // If atTimeMs is now or in the future, return current equity
    if (atTimeMs >= Date.now()) {
      return currentEquity;
    }

    // Get fills between atTimeMs and now to calculate PnL since then
    const fills = await this.tradeService.getRawFills({
      user,
      coin,
      fromMs: atTimeMs,
      toMs: Date.now(),
    });

    // Sum up realized PnL since atTimeMs
    let pnlSinceSnapshot = 0;
    for (const fill of fills) {
      pnlSinceSnapshot += parseFloat(fill.closedPnl);
    }

    // Historical equity = current equity - PnL earned since
    // This doesn't account for deposits/withdrawals but is a reasonable approximation
    return Math.max(currentEquity - pnlSinceSnapshot, 0.01);
  }

  /**
   * Calculate volume for a user within a time range.
   */
  async calculateVolume(params: PnlQueryParams): Promise<number> {
    const fills = await this.tradeService.getRawFills({
      user: params.user,
      coin: params.coin,
      fromMs: params.fromMs ?? 0,
      toMs: params.toMs ?? Date.now(),
    });

    let volume = 0;
    for (const fill of fills) {
      const isBuilderFill = this.builderFilter.isBuilderFill(fill);

      if (!params.builderOnly || isBuilderFill) {
        volume += parseFloat(fill.px) * parseFloat(fill.sz);
      }
    }

    return volume;
  }
}
