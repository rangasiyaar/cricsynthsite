// ============================================================
// CricVeda — Cache Layer (Upstash Redis + In-Memory Fallback)
// ============================================================

import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;
const memoryCache = new Map<string, { value: string; expiry: number }>();

function getRedis(): Redis | null {
  if (redisInstance) return redisInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    redisInstance = new Redis({ url, token });
    return redisInstance;
  } catch {
    console.warn('Redis init failed, using in-memory fallback');
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const val = await redis.get<T>(key);
      return val;
    } catch (err) {
      console.warn('Redis GET error:', err);
    }
  }

  // In-memory fallback
  const entry = memoryCache.get(key);
  if (entry && entry.expiry > Date.now()) {
    return JSON.parse(entry.value) as T;
  }
  memoryCache.delete(key);
  return null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
      return;
    } catch (err) {
      console.warn('Redis SET error:', err);
    }
  }

  // In-memory fallback
  memoryCache.set(key, {
    value: JSON.stringify(value),
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn('Redis DEL error:', err);
    }
  }

  memoryCache.delete(key);
}

export async function getRateCount(key: string): Promise<number> {
  const redis = getRedis();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        // Set expiry to end of day UTC
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const ttl = Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);
        await redis.expire(key, ttl);
      }
      return count;
    } catch (err) {
      console.warn('Redis INCR error:', err);
    }
  }

  // In-memory fallback
  const entry = memoryCache.get(key);
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);

  if (entry && entry.expiry > now) {
    const count = parseInt(entry.value, 10) + 1;
    memoryCache.set(key, { value: String(count), expiry: entry.expiry });
    return count;
  }

  memoryCache.set(key, { value: '1', expiry: endOfDay.getTime() });
  return 1;
}

// ─── Cache Key Builders ───

export const CacheKeys = {
  playerList: (page: number) => `cv:players:list:${page}`,
  player: (id: number) => `cv:player:${id}`,
  playerForm: (id: number, type: string) => `cv:player:${id}:form:${type}`,
  matchList: (league: string, page: number) => `cv:matches:${league}:${page}`,
  matchInsights: (id: number) => `cv:match:${id}:insights`,
  matchup: (batterId: number, bowlerId: number) => `cv:matchup:${batterId}:${bowlerId}`,
  venue: (id: number) => `cv:venue:${id}`,
  dreamTeam: (fixtureId: number) => `cv:fantasy:${fixtureId}:dream_team`,
  captainPicks: (fixtureId: number) => `cv:fantasy:${fixtureId}:captain_picks`,
  leaderboard: (type: string, league: string, role: string) => `cv:leaderboard:${type}:${league}:${role}`,
  rateLimit: (keyId: string) => `cv:rate:${keyId}:${new Date().toISOString().slice(0, 10)}`,
};
