import { FastifyInstance } from 'fastify';
import { LeaderboardService } from '../services/LeaderboardService';
import { UsersResponse } from '../types';

const ADDRESS_PATTERN = '^0x[a-fA-F0-9]{40}$';

interface RegisterUserBody {
  user: string;
}

interface RegisterUserResponse {
  success: boolean;
  user: string;
  message?: string;
}

export async function usersRoutes(
  fastify: FastifyInstance,
  leaderboardService: LeaderboardService
) {
  // Get all registered users
  fastify.get<{ Reply: UsersResponse }>('/v1/users', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const users = leaderboardService.getRegisteredUsers();
    return { users };
  });

  // Register a user
  fastify.post<{
    Body: RegisterUserBody;
    Reply: RegisterUserResponse;
  }>('/v1/users', {
    schema: {
      body: {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'string',
            pattern: ADDRESS_PATTERN,
            description: '42-character hex address',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: { type: 'string' },
            message: { type: 'string' },
          },
        },
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request.body;
    const isNew = leaderboardService.registerUser(user);

    if (isNew) {
      reply.status(201);
      return { success: true, user: user.toLowerCase() };
    } else {
      reply.status(200);
      return {
        success: true,
        user: user.toLowerCase(),
        message: 'User already registered',
      };
    }
  });

  // Delete a user registration
  fastify.delete<{
    Params: { user: string };
    Reply: RegisterUserResponse;
  }>('/v1/users/:user', {
    schema: {
      params: {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'string',
            pattern: ADDRESS_PATTERN,
            description: '42-character hex address',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request.params;
    const wasRemoved = leaderboardService.unregisterUser(user);

    if (wasRemoved) {
      return { success: true, user: user.toLowerCase() };
    } else {
      reply.status(404);
      return {
        success: false,
        user: user.toLowerCase(),
        message: 'User not found',
      };
    }
  });
}
