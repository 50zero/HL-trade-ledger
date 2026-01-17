import { FastifyInstance } from 'fastify';
import { LeaderboardService } from '../services/LeaderboardService';
import { LeaderboardQueryParams, LeaderboardResponse } from '../types';

export async function leaderboardRoutes(
  fastify: FastifyInstance,
  leaderboardService: LeaderboardService
) {
  fastify.get<{
    Querystring: LeaderboardQueryParams;
    Reply: LeaderboardResponse;
  }>('/v1/leaderboard', {
    schema: {
      querystring: {
        type: 'object',
        required: ['metric'],
        properties: {
          coin: {
            type: 'string',
            description: 'Filter by coin symbol (e.g., BTC, ETH)',
          },
          fromMs: {
            type: 'integer',
            minimum: 0,
            description: 'Start timestamp in milliseconds',
          },
          toMs: {
            type: 'integer',
            minimum: 0,
            description: 'End timestamp in milliseconds',
          },
          metric: {
            type: 'string',
            enum: ['volume', 'pnl', 'returnPct'],
            description: 'Metric to rank by',
          },
          builderOnly: {
            type: 'boolean',
            default: false,
            description: 'Filter to only builder-attributed trades',
          },
          maxStartCapital: {
            type: 'number',
            minimum: 0,
            description: 'Max starting capital for return calculation',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: 'Maximum number of entries to return',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rank: { type: 'integer' },
                  user: { type: 'string' },
                  metricValue: { type: 'number' },
                  tradeCount: { type: 'integer' },
                  tainted: { type: 'boolean' },
                },
              },
            },
            generatedAt: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await leaderboardService.getLeaderboard(request.query);
    return result;
  });
}
