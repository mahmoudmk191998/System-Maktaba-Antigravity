import { IEventBus } from './eventBus.types.js';
import { defaultInMemoryEventBus } from './inMemoryEventBus.js';
import { defaultRedisEventBus } from './redisEventBus.js';
import { env } from '../../config/environment.js';

export function getEventBus(): IEventBus {
  const provider = process.env.REALTIME_EVENT_BUS_PROVIDER || 'in-memory';
  if (provider === 'redis') {
    return defaultRedisEventBus;
  }
  return defaultInMemoryEventBus;
}

export const defaultEventBus = getEventBus();
