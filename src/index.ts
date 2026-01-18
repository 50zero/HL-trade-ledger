import { getConfig } from './config';
import { createDataSource } from './datasources/factory';
import { buildApp } from './app';

async function main() {
  const config = getConfig();

  const dataSource = createDataSource(config.datasourceType, {
    baseUrl: config.hyperliquidBaseUrl,
  });

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
