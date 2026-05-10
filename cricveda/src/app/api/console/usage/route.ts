import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/db/supabase';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    const db = getServiceClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get user's API keys
    const { data: keys } = await db
      .from('api_keys')
      .select('id')
      .eq('user_id', userId);

    if (!keys || keys.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total_requests: 0, daily_breakdown: [], endpoint_breakdown: [], error_rate: 0 },
      });
    }

    const keyIds = keys.map((k: Record<string, unknown>) => k.id as string);

    // Total requests
    const { count: totalRequests } = await db
      .from('api_usage_log')
      .select('*', { count: 'exact', head: true })
      .in('api_key_id', keyIds)
      .gte('created_at', since);

    // Errors
    const { count: errorCount } = await db
      .from('api_usage_log')
      .select('*', { count: 'exact', head: true })
      .in('api_key_id', keyIds)
      .gte('created_at', since)
      .gte('status_code', 400);

    const errorRate = totalRequests && totalRequests > 0
      ? Math.round(((errorCount || 0) / totalRequests) * 10000) / 100
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        total_requests: totalRequests || 0,
        error_count: errorCount || 0,
        error_rate: errorRate,
        period_days: days,
      },
    });
  } catch (err) {
    console.error('Usage API error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
