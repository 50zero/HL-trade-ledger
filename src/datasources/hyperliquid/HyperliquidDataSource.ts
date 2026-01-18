import axios, { AxiosInstance } from 'axios';
import { IDataSource, DataSourceConfig } from '../types';
import { RawFill, ClearinghouseState, FillsQuery } from '../../types';
import { RateLimiter, API_WEIGHTS } from './RateLimiter';
import pino from 'pino';

const logger = pino({ name: 'HyperliquidDataSource' });

/**
 * Hyperliquid public API datasource implementation.
 * Uses the Info endpoint for fetching fills and clearinghouse state.
 */
export class HyperliquidDataSource implements IDataSource {
  private readonly client: AxiosInstance;
  private readonly rateLimiter: RateLimiter;
  private readonly baseUrl: string;

  constructor(config: DataSourceConfig) {
    this.baseUrl = config.baseUrl;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Hyperliquid rate limit: 1200 weight per minute
    this.rateLimiter = new RateLimiter({
      maxWeight: config.rateLimitWeight ?? 1200,
      windowMs: config.rateLimitWindowMs ?? 60000,
    });
  }

  getName(): string {
    return 'hyperliquid';
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.rateLimiter.acquire(API_WEIGHTS.meta);
      const response = await this.client.post('/info', {
        type: 'meta',
      });
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return false;
    }
  }

  /**
   * Fetch user fills with automatic pagination.
   * Hyperliquid returns max 2000 fills per request.
   */
  async getUserFills(query: FillsQuery): Promise<RawFill[]> {
    const allFills: RawFill[] = [];
    const MAX_FILLS_PER_REQUEST = 2000;
    let currentStartTime = query.startTimeMs ?? 0;
    const endTime = query.endTimeMs ?? Date.now();

    logger.debug({ query, currentStartTime, endTime }, 'Starting getUserFills');

    while (currentStartTime < endTime) {
      await this.rateLimiter.acquire(API_WEIGHTS.userFillsByTime);

      try {
        const response = await this.client.post('/info', {
          type: 'userFillsByTime',
          user: query.user,
          startTime: currentStartTime,
          endTime: endTime,
          aggregateByTime: true,
        });

        const fills: RawFill[] = response.data || [];
        if (fills.length > 0) {
          logger.debug(
            { sampleFill: fills[0] },
            'Sample raw fill payload'
          );
        }

        if (fills.length === 0) {
          break;
        }

        // Filter by coin if specified
        const filteredFills = query.coin
          ? fills.filter(f => f.coin.toUpperCase() === query.coin!.toUpperCase())
          : fills;

        allFills.push(...filteredFills);

        logger.debug(
          {
            fetchedCount: fills.length,
            filteredCount: filteredFills.length,
            totalSoFar: allFills.length,
            lastTime: fills[fills.length - 1]?.time
          },
          'Fetched fills batch'
        );

        // Pagination: use last timestamp + 1ms as next startTime
        currentStartTime = fills[fills.length - 1].time + 1;

        // If we got fewer than max, we've reached the end
        if (fills.length < MAX_FILLS_PER_REQUEST) {
          break;
        }
      } catch (error) {
        logger.error({ error, query }, 'Failed to fetch fills');
        throw new Error(`Failed to fetch fills: ${error}`);
      }
    }

    // Sort by time ascending
    allFills.sort((a, b) => a.time - b.time);

    return allFills;
  }

  /**
   * Fetch current clearinghouse state for a user.
   */
  async getClearinghouseState(user: string): Promise<ClearinghouseState> {
    await this.rateLimiter.acquire(API_WEIGHTS.clearinghouseState);

    try {
      const response = await this.client.post('/info', {
        type: 'clearinghouseState',
        user: user,
      });

      return response.data as ClearinghouseState;
    } catch (error) {
      logger.error({ error, user }, 'Failed to fetch clearinghouse state');
      throw new Error(`Failed to fetch clearinghouse state: ${error}`);
    }
  }
}
