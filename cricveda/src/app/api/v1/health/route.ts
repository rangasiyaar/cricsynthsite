import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'healthy',
      version: 'v1',
      product: 'CricVeda',
      platform: 'CricSynthesis',
      timestamp: new Date().toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
      cached: false,
      cache_age_seconds: null,
      api_version: 'v1',
    },
  });
}
