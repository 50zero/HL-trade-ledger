import { FastifyInstance } from 'fastify';
import { TradeService } from '../services/TradeService';
import { TradesQueryParams, TradesResponse } from '../types';

const ADDRESS_PATTERN = '^0x[a-fA-F0-9]{40}$';

export async function tradesRoutes(
  fastify: FastifyInstance,
  tradeService: TradeService
) {
  fastify.get<{
    Querystring: TradesQueryParams;
    Reply: TradesResponse;
  }>('/v1/trades', {
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
          collapseBy: {
            type: 'string',
            enum: ['hash', 'oid', 'tid'],
            description: 'Collapse fills into unique trades by hash, order id, or trade id',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            trades: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timeMs: { type: 'number' },
                  coin: { type: 'string' },
                  side: { type: 'string', enum: ['buy', 'sell'] },
                  px: { type: 'number' },
                  sz: { type: 'number' },
                  fee: { type: 'number' },
                  closedPnl: { type: 'number' },
                  builder: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await tradeService.getTrades(request.query);
    return result;
  });
}
