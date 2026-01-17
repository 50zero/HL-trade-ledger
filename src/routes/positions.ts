import { FastifyInstance } from 'fastify';
import { PositionService } from '../services/PositionService';
import { PositionsQueryParams, PositionsResponse } from '../types';

const ADDRESS_PATTERN = '^0x[a-fA-F0-9]{40}$';

export async function positionsRoutes(
  fastify: FastifyInstance,
  positionService: PositionService
) {
  fastify.get<{
    Querystring: PositionsQueryParams;
    Reply: PositionsResponse;
  }>('/v1/positions/history', {
    schema: {
      querystring: {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'string',
            pattern: ADDRESS_PATTERN,
            description: '42-character hex address',
          },
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
          builderOnly: {
            type: 'boolean',
            default: false,
            description: 'Filter to only builder-attributed trades',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            positions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timeMs: { type: 'number' },
                  coin: { type: 'string' },
                  netSize: { type: 'number' },
                  avgEntryPx: { type: 'number' },
                  tainted: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await positionService.getPositionHistory(request.query);
    return result;
  });
}
