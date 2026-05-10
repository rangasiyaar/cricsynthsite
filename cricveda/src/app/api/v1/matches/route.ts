import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess } from '@/lib/middleware';
import { queryMany } from '@/lib/db/supabase';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { Fixture } from '@/lib/types';

export async function GET(req: NextRequest) {
  return withOptionalAuth(req, async () => {
    const url = new URL(req.url);
    const league = url.searchParams.get('league') || '';
    const status = url.searchParams.get('status') || 'upcoming';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20', 10), 50);

    const cacheKey = CacheKeys.matchList(league || 'all', page);
    const cached = await cacheGet<{ data: Fixture[]; count: number }>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const filters: Record<string, string> = {};
    if (league) filters.league_id = league;
    if (status) filters.status = status;

    const result = await queryMany<Fixture>('fixtures', filters, {
      page,
      perPage,
      orderBy: 'date',
      ascending: true,
    });

    await cacheSet(cacheKey, result, 120);

    return apiSuccess({
      matches: result.data,
      pagination: {
        page,
        per_page: perPage,
        total: result.count,
        total_pages: Math.ceil(result.count / perPage),
      },
    });
  });
}
