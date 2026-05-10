// ============================================================
// CricVeda — API Middleware (Auth + Response Helpers)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitHeaders } from '@/lib/auth/rate-limit';
import { getServiceClient } from '@/lib/db/supabase';
import type { ApiResponse } from '@/lib/types';

// ─── Auth Context ───

export interface AuthContext {
  userId: string;
  keyId: string;
  plan: string;
}

// ─── Extract API key from request ───

function extractApiKey(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const url = new URL(req.url);
  return url.searchParams.get('api_key');
}

// ─── withAuth: key required ───

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const key = extractApiKey(req);

  if (!key) {
    return apiError('API key required. Pass via Authorization: Bearer <key> or ?api_key=<key>', 401, 'AUTH_REQUIRED');
  }

  const result = await validateApiKey(key);

  if (!result.valid || !result.keyRecord || !result.userId) {
    return apiError('Invalid or revoked API key', 401, 'INVALID_KEY');
  }

  const rateResult = await checkRateLimit(result.keyRecord.id, result.plan || 'free');

  if (!rateResult.allowed) {
    const res = apiError('Daily rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    const headers = rateLimitHeaders(rateResult);
    for (const [k, v] of Object.entries(headers)) {
      res.headers.set(k, v);
    }
    return res;
  }

  // Log usage
  logUsage(result.keyRecord.id, req.method, new URL(req.url).pathname, 200, 0);

  const response = await handler(req, {
    userId: result.userId,
    keyId: result.keyRecord.id,
    plan: result.plan || 'free',
  });

  // Attach rate limit headers
  const headers = rateLimitHeaders(rateResult);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }

  return response;
}

// ─── withOptionalAuth: key optional ───

export async function withOptionalAuth(
  req: NextRequest,
  handler: (req: NextRequest, auth: AuthContext | null) => Promise<NextResponse>
): Promise<NextResponse> {
  const key = extractApiKey(req);

  if (!key) {
    return handler(req, null);
  }

  const result = await validateApiKey(key);

  if (!result.valid || !result.keyRecord || !result.userId) {
    return handler(req, null);
  }

  const rateResult = await checkRateLimit(result.keyRecord.id, result.plan || 'free');

  if (!rateResult.allowed) {
    const res = apiError('Daily rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    const headers = rateLimitHeaders(rateResult);
    for (const [k, v] of Object.entries(headers)) {
      res.headers.set(k, v);
    }
    return res;
  }

  logUsage(result.keyRecord.id, req.method, new URL(req.url).pathname, 200, 0);

  const response = await handler(req, {
    userId: result.userId,
    keyId: result.keyRecord.id,
    plan: result.plan || 'free',
  });

  const headers = rateLimitHeaders(rateResult);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }

  return response;
}

// ─── Response Helpers ───

export function apiSuccess<T>(data: T, cached: boolean = false, cacheAge: number | null = null): NextResponse {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      cached,
      cache_age_seconds: cacheAge,
      api_version: 'v1',
    },
  };
  return NextResponse.json(body, { status: 200 });
}

export function apiError(message: string, status: number = 400, code?: string): NextResponse {
  const body: ApiResponse = {
    success: false,
    error: message,
    code,
    meta: {
      timestamp: new Date().toISOString(),
      cached: false,
      cache_age_seconds: null,
      api_version: 'v1',
    },
  };
  return NextResponse.json(body, { status });
}

// ─── Usage Logger (fire and forget) ───

function logUsage(
  keyId: string,
  method: string,
  endpoint: string,
  statusCode: number,
  latencyMs: number,
  errorCode?: string
): void {
  try {
    const db = getServiceClient();
    db.from('api_usage_log')
      .insert({
        api_key_id: keyId,
        endpoint,
        method,
        status_code: statusCode,
        latency_ms: latencyMs,
        error_code: errorCode || null,
      })
      .then(() => {})
      .catch(() => {});
  } catch {
    // Fire and forget
  }
}
