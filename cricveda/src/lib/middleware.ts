// ============================================================
// CricVeda — API Middleware
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { ApiKey } from '@/lib/types';

// ─── RESPONSE HELPERS ───

export function apiSuccess<T>(data: T, cached: boolean = false, cacheAge: number | null = null) {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      cached,
      cache_age_seconds: cacheAge,
      api_version: 'v1',
    },
  });
}

export function apiError(
  message: string,
  code: string,
  status: number = 400,
  headers?: Record<string, string>
) {
  const response = NextResponse.json(
    {
      success: false,
      error: message,
      code,
      meta: {
        timestamp: new Date().toISOString(),
        api_version: 'v1',
      },
    },
    { status }
  );

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }

  return response;
}

// ─── AUTH MIDDLEWARE ───

export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, apiKey: ApiKey) => Promise<NextResponse>
): Promise<NextResponse> {
  // Extract API key from header or query
  const authHeader = request.headers.get('Authorization');
  const queryKey = request.nextUrl.searchParams.get('api_key');

  let key: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.substring(7);
  } else if (queryKey) {
    key = queryKey;
  }

  if (!key) {
    return apiError(
      'API key required. Include in Authorization header as Bearer token or as api_key query parameter.',
      'AUTH_REQUIRED',
      401
    );
  }

  // Validate key
  const apiKey = await validateApiKey(key);

  if (!apiKey) {
    return apiError('Invalid or revoked API key.', 'AUTH_INVALID', 401);
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(apiKey);

  if (!rateLimit.allowed) {
    return apiError(
      `Rate limit exceeded. Daily limit: ${rateLimit.limit}. Upgrade at https://cricveda.com/pricing`,
      'RATE_LIMIT_EXCEEDED',
      429,
      rateLimit.headers
    );
  }

  // Call handler
  const response = await handler(request, apiKey);

  // Add rate limit headers to response
  for (const [k, v] of Object.entries(rateLimit.headers)) {
    response.headers.set(k, v);
  }

  return response;
}

// ─── OPTIONAL AUTH (for free endpoints that benefit from auth) ───

export async function withOptionalAuth(
  request: NextRequest,
  handler: (req: NextRequest, apiKey: ApiKey | null) => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const queryKey = request.nextUrl.searchParams.get('api_key');

  let key: string | null = null;
  if (authHeader?.startsWith('Bearer ')) key = authHeader.substring(7);
  else if (queryKey) key = queryKey;

  let apiKey: ApiKey | null = null;
  if (key) {
    apiKey = await validateApiKey(key);
  }

  if (apiKey) {
    const rateLimit = await checkRateLimit(apiKey);
    if (!rateLimit.allowed) {
      return apiError('Rate limit exceeded.', 'RATE_LIMIT_EXCEEDED', 429, rateLimit.headers);
    }
  }

  const response = await handler(request, apiKey);

  return response;
}

// ─── CORS HEADERS ───

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}
