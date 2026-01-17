import { FastifyInstance } from 'fastify';
import { PnlService } from '../services/PnlService';
import { PnlQueryParams, PnlResponse } from '../types';

const ADDRESS_PATTERN = '^0x[a-fA-F0-9]{40}$';

export async function pnlRoutes(
  fastify: FastifyInstance,
  pnlService: PnlService
) {
  fastify.get<{
    Querystring: PnlQueryParams;
    Reply: PnlResponse;
  }>('/v1/pnl', {
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
          maxStartCapital: {
            type: 'number',
            minimum: 0,
            description: 'Max starting capital for return calculation (capped normalization)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            realizedPnl: { type: 'number' },
            returnPct: { type: 'number' },
            feesPaid: { type: 'number' },
            tradeCount: { type: 'integer' },
            tainted: { type: 'boolean' },
            effectiveCapital: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await pnlService.calculatePnl(request.query);
    return result;
  });
}
