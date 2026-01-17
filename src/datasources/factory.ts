import { IDataSource, DataSourceConfig } from './types';
import { HyperliquidDataSource } from './hyperliquid/HyperliquidDataSource';
import { DataSourceType } from '../config';

/**
 * Factory function to create datasource instances.
 * Allows easy swapping between Hyperliquid, InSilico-HL, and HyperServe.
 */
export function createDataSource(
  type: DataSourceType,
  config: DataSourceConfig
): IDataSource {
  switch (type) {
    case 'hyperliquid':
      return new HyperliquidDataSource(config);

    case 'insilico-hl':
      // Future implementation for InSilico-HL
      throw new Error(
        'InSilico-HL datasource not yet implemented. ' +
        'Create InSilicoHLDataSource implementing IDataSource interface.'
      );

    case 'hyperserve':
      // Future implementation for HyperServe
      throw new Error(
        'HyperServe datasource not yet implemented. ' +
        'Create HyperServeDataSource implementing IDataSource interface.'
      );

    default:
      throw new Error(`Unknown datasource type: ${type}`);
  }
}
