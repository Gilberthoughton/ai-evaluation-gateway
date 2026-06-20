import { Redis } from 'ioredis';

/** A Redis connection configured for BullMQ (blocking commands require maxRetriesPerRequest: null). */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
