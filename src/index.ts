import { getConfig } from './config';
import { createDataSource } from './datasources/factory';
import { buildApp } from './app';

async function main() {
  const config = getConfig();

  console.log('===========================================');
  console.log('  Hyperliquid Trade Ledger API');
  console.log('===========================================');
  console.log(`  Port: ${config.port}`);
  console.log(`  Datasource: ${config.datasourceType}`);
  console.log(`  Target Builder: ${config.targetBuilder || 'Not configured'}`);
  console.log(`  Max Start Capital: ${config.maxStartCapital}`);
  console.log(`  Log Level: ${config.logLevel}`);
  console.log('===========================================\n');

  // Create datasource
  const dataSource = createDataSource(config.datasourceType, {
    baseUrl: config.hyperliquidBaseUrl,
  });

  // Build and start the app
  const app = await buildApp(config, dataSource);

  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    console.log(`\nServer listening on http://0.0.0.0:${config.port}`);
    console.log('\nAvailable endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /v1/trades');
    console.log('  GET  /v1/positions/history');
    console.log('  GET  /v1/pnl');
    console.log('  GET  /v1/leaderboard');
    console.log('  GET  /v1/users');
    console.log('  POST /v1/users');
    console.log('  DELETE /v1/users/:user\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
