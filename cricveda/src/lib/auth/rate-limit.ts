// ============================================================
// CricVeda — Rate Limiter (F3.8)
// ============================================================

import { getRateCount } from '@/lib/cache/redis';
import { ApiKey } from '@/lib/types';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: string;        // UTC timestamp when limit resets
  headers: Record<string, string>;
}

// ─── CHECK RATE LIMIT ───

export async function checkRateLimit(apiKey: ApiKey): Promise<RateLimitResult> {
  const count = await getRateCount(apiKey.id);

  const limit = apiKey.daily_limit;
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  // Reset at end of day UTC
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(23, 59, 59, 999);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': reset.toISOString(),
  };

  return { allowed, limit, remaining, reset: reset.toISOString(), headers };
}

// ─── RATE LIMIT TIERS ───

export const RATE_LIMITS = {
  free: {
    daily: 100,
    burst: 10, // per second
  },
  pro: {
    daily: 5000,
    burst: 50,
  },
  enterprise: {
    daily: 50000,
    burst: 200,
  },
};
