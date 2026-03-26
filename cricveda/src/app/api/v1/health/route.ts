// GET /api/v1/health — Health check
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      api_version: 'v1',
      product: 'CricVeda',
      description: 'Fantasy Cricket Intelligence API',
      documentation: 'https://cricveda.com/docs',
    },
    meta: {
      timestamp: new Date().toISOString(),
      cached: false,
      cache_age_seconds: null,
      api_version: 'v1',
    },
  });
}
