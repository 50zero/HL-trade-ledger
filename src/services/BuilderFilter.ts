import { RawFill, NormalizedFill } from '../types';

/**
 * Service for builder-only filtering and taint detection.
 * A position is "tainted" if it has both builder and non-builder fills
 * within the same position lifecycle.
 */
export class BuilderFilter {
  private readonly targetBuilder: string | null;

  constructor(targetBuilder: string | null) {
    this.targetBuilder = targetBuilder?.toLowerCase() || null;
  }

  /**
   * Check if a fill was executed through the target builder.
   * A fill is builder-attributed if:
   * 1. builderFee field exists and is > 0
   * 2. The implied builder matches TARGET_BUILDER
   *
   * Note: Hyperliquid's public API may not expose the builder address directly.
   * This implementation checks for builderFee presence as a proxy.
   */
  isBuilderFill(fill: RawFill): boolean {
    if (!this.targetBuilder) return false;

    // builderFee is only present when > 0
    if (!fill.builderFee) return false;

    const builderFee = parseFloat(fill.builderFee);
    return builderFee > 0;
  }

  /**
   * Check if a normalized fill is from the target builder.
   */
  isBuilderFillNormalized(fill: NormalizedFill): boolean {
    if (!this.targetBuilder) return false;
    if (!fill.builder) return false;
    return fill.builder.toLowerCase() === this.targetBuilder;
  }

  /**
   * Detect taint status for a set of fills.
   * Returns true if both builder and non-builder fills exist.
   */
  detectTaint(fills: RawFill[]): {
    hasBuilder: boolean;
    hasNonBuilder: boolean;
    tainted: boolean;
  } {
    if (!this.targetBuilder) {
      return { hasBuilder: false, hasNonBuilder: true, tainted: false };
    }

    let hasBuilder = false;
    let hasNonBuilder = false;

    for (const fill of fills) {
      if (this.isBuilderFill(fill)) {
        hasBuilder = true;
      } else {
        hasNonBuilder = true;
      }

      // Early exit if already tainted
      if (hasBuilder && hasNonBuilder) {
        return { hasBuilder: true, hasNonBuilder: true, tainted: true };
      }
    }

    return { hasBuilder, hasNonBuilder, tainted: hasBuilder && hasNonBuilder };
  }

  /**
   * Filter fills to only include builder-attributed fills.
   * Used when builderOnly=true is requested.
   */
  filterBuilderFills(fills: RawFill[]): RawFill[] {
    if (!this.targetBuilder) return [];
    return fills.filter(fill => this.isBuilderFill(fill));
  }

  /**
   * Group fills by position lifecycle.
   * A lifecycle starts when position goes 0 -> non-zero
   * and ends when it returns to 0.
   */
  groupByPositionLifecycle(
    fills: RawFill[],
    coin: string
  ): RawFill[][] {
    const lifecycles: RawFill[][] = [];
    let currentLifecycle: RawFill[] = [];
    let currentPosition = 0;

    // Filter and sort by coin and time
    const coinFills = fills
      .filter(f => f.coin.toUpperCase() === coin.toUpperCase())
      .sort((a, b) => a.time - b.time);

    for (const fill of coinFills) {
      const size = parseFloat(fill.sz);
      const side = fill.side === 'B' ? 1 : -1; // B=Buy=+, A=Sell=-
      const fillSize = size * side;

      // Position was flat, now opening
      if (currentPosition === 0 && fillSize !== 0) {
        currentLifecycle = [fill];
      } else {
        currentLifecycle.push(fill);
      }

      currentPosition += fillSize;

      // Position closed (returned to 0)
      if (currentPosition === 0 && currentLifecycle.length > 0) {
        lifecycles.push(currentLifecycle);
        currentLifecycle = [];
      }
    }

    // Don't forget incomplete lifecycle (position still open)
    if (currentLifecycle.length > 0) {
      lifecycles.push(currentLifecycle);
    }

    return lifecycles;
  }

  /**
   * Check if any lifecycle is tainted in builderOnly mode.
   */
  isAnyLifecycleTainted(fills: RawFill[], coin: string): boolean {
    if (!this.targetBuilder) return false;

    const lifecycles = this.groupByPositionLifecycle(fills, coin);

    for (const lifecycle of lifecycles) {
      const { tainted } = this.detectTaint(lifecycle);
      if (tainted) return true;
    }

    return false;
  }

  /**
   * Get target builder address.
   */
  getTargetBuilder(): string | null {
    return this.targetBuilder;
  }
}
