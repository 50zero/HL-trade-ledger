import { PnlService } from './PnlService';
import { BuilderFilter } from './BuilderFilter';
import { LeaderboardQueryParams, LeaderboardEntry, LeaderboardResponse } from '../types';

/**
 * Service for generating leaderboards.
 * Users must be registered before appearing on leaderboard.
 */
export class LeaderboardService {
  private readonly registeredUsers: Set<string>;

  constructor(
    private readonly pnlService: PnlService,
    private readonly builderFilter: BuilderFilter
  ) {
    this.registeredUsers = new Set();
  }

  /**
   * Register a user for leaderboard tracking.
   */
  registerUser(user: string): boolean {
    const normalizedUser = user.toLowerCase();
    if (this.registeredUsers.has(normalizedUser)) {
      return false; // Already registered
    }
    this.registeredUsers.add(normalizedUser);
    return true;
  }

  /**
   * Unregister a user from leaderboard tracking.
   */
  unregisterUser(user: string): boolean {
    return this.registeredUsers.delete(user.toLowerCase());
  }

  /**
   * Get all registered users.
   */
  getRegisteredUsers(): string[] {
    return Array.from(this.registeredUsers);
  }

  /**
   * Check if a user is registered.
   */
  isUserRegistered(user: string): boolean {
    return this.registeredUsers.has(user.toLowerCase());
  }

  /**
   * Generate leaderboard based on specified metric.
   */
  async getLeaderboard(params: LeaderboardQueryParams): Promise<LeaderboardResponse> {
    const users = this.getRegisteredUsers();
    const limit = params.limit ?? 100;

    if (users.length === 0) {
      return {
        entries: [],
        generatedAt: Date.now(),
      };
    }

    // Calculate metrics for all registered users
    const userMetrics: Array<{
      user: string;
      metricValue: number;
      tradeCount: number;
      tainted: boolean;
    }> = [];

    for (const user of users) {
      try {
        const pnl = await this.pnlService.calculatePnl({
          user,
          coin: params.coin,
          fromMs: params.fromMs,
          toMs: params.toMs,
          builderOnly: params.builderOnly,
          maxStartCapital: params.maxStartCapital,
        });

        // In builderOnly mode, skip tainted users for leaderboard
        if (params.builderOnly && pnl.tainted) {
          continue;
        }

        let metricValue: number;

        switch (params.metric) {
          case 'pnl':
            metricValue = pnl.realizedPnl;
            break;

          case 'returnPct':
            metricValue = pnl.returnPct;
            break;

          case 'volume':
            metricValue = await this.pnlService.calculateVolume({
              user,
              coin: params.coin,
              fromMs: params.fromMs,
              toMs: params.toMs,
              builderOnly: params.builderOnly,
            });
            break;

          default:
            throw new Error(`Unknown metric: ${params.metric}`);
        }

        userMetrics.push({
          user,
          metricValue,
          tradeCount: pnl.tradeCount,
          tainted: pnl.tainted,
        });
      } catch (error) {
        // Skip users that fail (e.g., no data)
        console.error(`Failed to calculate metrics for ${user}:`, error);
      }
    }

    // Sort by metric value (descending for positive metrics)
    userMetrics.sort((a, b) => b.metricValue - a.metricValue);

    // Apply limit and add ranks
    const entries: LeaderboardEntry[] = userMetrics
      .slice(0, limit)
      .map((m, index) => ({
        rank: index + 1,
        user: m.user,
        metricValue: m.metricValue,
        tradeCount: m.tradeCount,
        tainted: m.tainted,
      }));

    return {
      entries,
      generatedAt: Date.now(),
    };
  }
}
