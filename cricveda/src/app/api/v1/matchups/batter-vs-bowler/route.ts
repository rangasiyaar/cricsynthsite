import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { computeMatchup } from '@/lib/analytics/matchup';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { MatchupResult } from '@/lib/types';

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const url = new URL(req.url);
    const batterId = parseInt(url.searchParams.get('batter_id') || '', 10);
    const bowlerId = parseInt(url.searchParams.get('bowler_id') || '', 10);

    if (isNaN(batterId) || isNaN(bowlerId)) {
      return apiError('Both batter_id and bowler_id are required', 400, 'MISSING_PARAMS');
    }

    const cacheKey = CacheKeys.matchup(batterId, bowlerId);
    const cached = await cacheGet<MatchupResult>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const result = await computeMatchup(batterId, bowlerId);
    if (!result) {
      return apiError('No matchup data found for this pair', 404, 'NO_DATA');
    }

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
