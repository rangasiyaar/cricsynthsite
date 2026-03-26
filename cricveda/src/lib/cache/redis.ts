// ============================================================
// CricVeda — Redis Cache (Upstash)
// ============================================================

interface CacheEntry {
  data: unknown;
  expires_at: number;
}

// In-memory fallback cache when Redis is unavailable
const memoryCache = new Map<string, CacheEntry>();

let redisClient: { get: (key: string) => Promise<string | null>; set: (key: string, value: string, options?: { ex?: number }) => Promise<void>; incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<void>; del: (key: string) => Promise<void> } | null = null;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Cache] Redis not configured — using in-memory fallback');
    return null;
  }

  try {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url, token }) as unknown as typeof redisClient;
    return redisClient;
  } catch {
    console.warn('[Cache] Failed to initialize Redis — using in-memory fallback');
    return null;
  }
}

// ─── CACHE OPERATIONS ───

export async function cacheGet<T>(key: string): Promise<T | null> {
  const prefixedKey = `cricveda:${key}`;

  try {
    const redis = await getRedis();
    if (redis) {
      const result = await redis.get(prefixedKey);
      if (result) {
        return JSON.parse(result as string) as T;
      }
      return null;
    }
  } catch {
    // Fall through to memory cache
  }

  // Memory cache fallback
  const entry = memoryCache.get(prefixedKey);
  if (entry && entry.expires_at > Date.now()) {
    return entry.data as T;
  }
  memoryCache.delete(prefixedKey);
  return null;
}

export async function cacheSet(
  key: string,
  data: unknown,
  ttlSeconds: number = 300
): Promise<void> {
  const prefixedKey = `cricveda:${key}`;
  const serialized = JSON.stringify(data);

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(prefixedKey, serialized, { ex: ttlSeconds });
      return;
    }
  } catch {
    // Fall through to memory cache
  }

  // Memory cache fallback
  memoryCache.set(prefixedKey, {
    data,
    expires_at: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDel(key: string): Promise<void> {
  const prefixedKey = `cricveda:${key}`;

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.del(prefixedKey);
    }
  } catch {
    // Ignore
  }

  memoryCache.delete(prefixedKey);
}

// ─── RATE LIMITING ───

export async function getRateCount(apiKeyId: string): Promise<number> {
  const key = `cricveda:rate:${apiKeyId}`;

  try {
    const redis = await getRedis();
    if (redis) {
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
    }
  } catch {
    // Fall through
  }

  // Memory fallback
  const dayKey = `${key}:${new Date().toISOString().split('T')[0]}`;
  const entry = memoryCache.get(dayKey);
  const count = entry ? (entry.data as number) + 1 : 1;
  memoryCache.set(dayKey, {
    data: count,
    expires_at: Date.now() + 86400000,
  });
  return count;
}

// ─── CACHE KEYS FACTORY ───

export const CacheKeys = {
  playerForm: (playerId: number) => `player:${playerId}:form`,
  matchup: (batterId: number, bowlerId: number) => `matchup:${batterId}:${bowlerId}`,
  venueStats: (venueId: number) => `venue:${venueId}:stats`,
  fixtureInsight: (fixtureId: number, type: string) => `fixture:${fixtureId}:${type}`,
  dreamTeam: (fixtureId: number) => `fixture:${fixtureId}:dream_team`,
  captainPicks: (fixtureId: number) => `fixture:${fixtureId}:captain_picks`,
  playerProfile: (playerId: number) => `player:${playerId}:profile`,
  matchList: (league?: string, page?: number) => `matches:${league || 'all'}:p${page || 1}`,
};
