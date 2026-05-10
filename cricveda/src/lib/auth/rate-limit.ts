// ============================================================
// CricVeda — Rate Limiting
// ============================================================

import { getRateCount, CacheKeys } from '@/lib/cache/redis';
import type { RateLimitResult } from '@/lib/types';
import { RATE_LIMITS } from '@/lib/types';

export async function checkRateLimit(
  keyId: string,
  plan: string
): Promise<RateLimitResult> {
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const cacheKey = CacheKeys.rateLimit(keyId);
  const count = await getRateCount(cacheKey);

  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(23, 59, 59, 999);

  return {
    allowed: count <= limits.daily,
    limit: limits.daily,
    remaining: Math.max(0, limits.daily - count),
    reset,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.reset.toISOString(),
  };
}
