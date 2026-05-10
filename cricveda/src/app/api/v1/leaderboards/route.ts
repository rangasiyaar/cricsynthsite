import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { queryMany } from '@/lib/db/supabase';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(req: NextRequest) {
  return withOptionalAuth(req, async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'form';
    const league = url.searchParams.get('league') || 'all';
    const role = url.searchParams.get('role') || 'all';

    const validTypes = ['form', 'fantasy', 'consistency', 'rising'];
    if (!validTypes.includes(type)) {
      return apiError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400, 'INVALID_PARAMS');
    }

    const cacheKey = CacheKeys.leaderboard(type, league, role);
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const filters: Record<string, string> = { type };
    if (league !== 'all') filters.league = league;
    if (role !== 'all') filters.role = role;

    const { data } = await queryMany<Record<string, unknown>>('leaderboard_cache', filters, {
      orderBy: 'computed_at',
      ascending: false,
    });

    const result = { type, league, role, entries: data.length > 0 ? data[0] : [] };
    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
