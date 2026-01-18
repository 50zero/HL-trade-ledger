import { RawFill, NormalizedFill } from '../types';

export class BuilderFilter {
  private readonly targetBuilder: string | null;

  constructor(targetBuilder: string | null) {
    this.targetBuilder = targetBuilder?.toLowerCase() || null;
  }


  getBuilderAddress(fill: RawFill): string | null {
    if (!fill.builder) return null;
    if (typeof fill.builder === 'string') return fill.builder;
    if (typeof fill.builder === 'object' && typeof fill.builder.b === 'string') {
      return fill.builder.b;
    }
    return null;
  }


  isBuilderFill(fill: RawFill): boolean {
    if (!this.targetBuilder) return false;

    const builderAddress = this.getBuilderAddress(fill);
    if (builderAddress) {
      return builderAddress.toLowerCase() === this.targetBuilder;
    }

    if (!fill.builderFee) return false;

    const builderFee = parseFloat(fill.builderFee);
    return builderFee > 0;
  }


  isBuilderFillNormalized(fill: NormalizedFill): boolean {
    if (!this.targetBuilder) return false;
    if (!fill.builder) return false;
    return fill.builder.toLowerCase() === this.targetBuilder;
  }


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

      if (hasBuilder && hasNonBuilder) {
        return { hasBuilder: true, hasNonBuilder: true, tainted: true };
      }
    }

    return { hasBuilder, hasNonBuilder, tainted: hasBuilder && hasNonBuilder };
  }


  filterBuilderFills(fills: RawFill[]): RawFill[] {
    if (!this.targetBuilder) return [];
    return fills.filter(fill => this.isBuilderFill(fill));
  }


  groupByPositionLifecycle(
    fills: RawFill[],
    coin: string
  ): RawFill[][] {
    const lifecycles: RawFill[][] = [];
    let currentLifecycle: RawFill[] = [];
    let currentPosition = 0;

    const coinFills = fills
      .filter(f => f.coin.toUpperCase() === coin.toUpperCase())
      .sort((a, b) => a.time - b.time);

    for (const fill of coinFills) {
      const size = parseFloat(fill.sz);
      const side = fill.side === 'B' ? 1 : -1; // B=Buy=+, A=Sell=-
      const fillSize = size * side;

      if (currentPosition === 0 && fillSize !== 0) {
        currentLifecycle = [fill];
      } else {
        currentLifecycle.push(fill);
      }

      currentPosition += fillSize;

      if (currentPosition === 0 && currentLifecycle.length > 0) {
        lifecycles.push(currentLifecycle);
        currentLifecycle = [];
      }
    }

    if (currentLifecycle.length > 0) {
      lifecycles.push(currentLifecycle);
    }

    return lifecycles;
  }


  isAnyLifecycleTainted(fills: RawFill[], coin: string): boolean {
    if (!this.targetBuilder) return false;

    const lifecycles = this.groupByPositionLifecycle(fills, coin);

    for (const lifecycle of lifecycles) {
      const { tainted } = this.detectTaint(lifecycle);
      if (tainted) return true;
    }

    return false;
  }


  getTargetBuilder(): string | null {
    return this.targetBuilder;
  }
}
