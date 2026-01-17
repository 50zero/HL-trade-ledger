import { FastifyInstance } from 'fastify';
import { IDataSource } from '../datasources/types';
import { HealthResponse } from '../types';

export async function healthRoutes(
  fastify: FastifyInstance,
  dataSource: IDataSource
) {
  fastify.get<{ Reply: HealthResponse }>('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy'] },
            datasource: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const isHealthy = await dataSource.healthCheck();

    const response: HealthResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      datasource: dataSource.getName(),
      timestamp: Date.now(),
    };

    reply.status(isHealthy ? 200 : 503).send(response);
  });
}
