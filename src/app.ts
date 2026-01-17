import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { AppConfig } from './config';
import { IDataSource } from './datasources/types';
import { CacheManager } from './cache/CacheManager';
import {
  BuilderFilter,
  TradeService,
  PositionService,
  PnlService,
  LeaderboardService,
} from './services';
import {
  healthRoutes,
  tradesRoutes,
  positionsRoutes,
  pnlRoutes,
  leaderboardRoutes,
  usersRoutes,
} from './routes';

export async function buildApp(
  config: AppConfig,
  dataSource: IDataSource
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE'],
  });

  // Initialize services
  const cache = new CacheManager(config.cache);
  const builderFilter = new BuilderFilter(config.targetBuilder);
  const tradeService = new TradeService(dataSource, cache, builderFilter);
  const positionService = new PositionService(
    dataSource,
    cache,
    builderFilter,
    tradeService
  );
  const pnlService = new PnlService(
    dataSource,
    cache,
    builderFilter,
    tradeService,
    config.maxStartCapital
  );
  const leaderboardService = new LeaderboardService(pnlService, builderFilter);

  // Register routes
  await healthRoutes(fastify, dataSource);
  await tradesRoutes(fastify, tradeService);
  await positionsRoutes(fastify, positionService);
  await pnlRoutes(fastify, pnlService);
  await leaderboardRoutes(fastify, leaderboardService);
  await usersRoutes(fastify, leaderboardService);

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    // Handle validation errors
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation,
      });
      return;
    }

    // Handle other errors
    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      name: 'Hyperliquid Trade Ledger API',
      version: '1.0.0',
      endpoints: {
        health: 'GET /health',
        trades: 'GET /v1/trades?user=&coin=&fromMs=&toMs=&builderOnly=',
        positions: 'GET /v1/positions/history?user=&coin=&fromMs=&toMs=&builderOnly=',
        pnl: 'GET /v1/pnl?user=&coin=&fromMs=&toMs=&builderOnly=&maxStartCapital=',
        leaderboard: 'GET /v1/leaderboard?metric=&coin=&fromMs=&toMs=&builderOnly=&limit=',
        users: 'GET /v1/users',
        registerUser: 'POST /v1/users',
      },
      documentation: {
        builderOnly: 'Set to true to filter trades by TARGET_BUILDER env var',
        tainted: 'Positions with mixed builder/non-builder activity are marked as tainted',
      },
    };
  });

  return fastify;
}
