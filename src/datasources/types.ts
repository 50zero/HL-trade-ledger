import { RawFill, ClearinghouseState, FillsQuery } from '../types';

/**
 * Datasource abstraction interface.
 * Implement this interface to add new data sources (e.g., InSilico-HL, HyperServe).
 */
export interface IDataSource {
  /**
   * Get user fills within a time range.
   * Implementations should handle pagination internally.
   */
  getUserFills(query: FillsQuery): Promise<RawFill[]>;

  /**
   * Get current clearinghouse state for a user.
   * Returns positions, margin info, and account value.
   */
  getClearinghouseState(user: string): Promise<ClearinghouseState>;

  /**
   * Get the name of this datasource for logging/debugging.
   */
  getName(): string;

  /**
   * Check if the datasource is healthy and reachable.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Configuration for datasource implementations.
 */
export interface DataSourceConfig {
  baseUrl: string;
  rateLimitWeight?: number;
  rateLimitWindowMs?: number;
}
