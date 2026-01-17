/**
 * Token bucket rate limiter for Hyperliquid API.
 * Hyperliquid has 1200 weight/minute limit.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRateMs: number;
  private readonly refillAmount: number;

  constructor(config: {
    maxWeight: number;
    windowMs: number;
  }) {
    this.maxTokens = config.maxWeight;
    this.tokens = config.maxWeight;
    this.lastRefill = Date.now();
    // Refill tokens gradually
    this.refillRateMs = config.windowMs / config.maxWeight;
    this.refillAmount = 1;
  }

  /**
   * Acquire tokens for a request. Waits if necessary.
   */
  async acquire(weight: number): Promise<void> {
    this.refill();

    while (this.tokens < weight) {
      const waitTime = Math.ceil((weight - this.tokens) * this.refillRateMs);
      await this.sleep(Math.min(waitTime, 1000));
      this.refill();
    }

    this.tokens -= weight;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRateMs) * this.refillAmount;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current available tokens (for debugging).
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Weight constants for Hyperliquid API endpoints
export const API_WEIGHTS = {
  userFills: 20,
  userFillsByTime: 20,
  clearinghouseState: 2,
  meta: 1,
} as const;
