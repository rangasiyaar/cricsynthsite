// GET /api/v1/matchups/batter-vs-bowler — H2H matchup
import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getMatchup } from '@/lib/analytics/matchup';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(request: NextRequest) {
  return withOptionalAuth(request, async (req) => {
    const batterId = parseInt(req.nextUrl.searchParams.get('batter_id') || '');
    const bowlerId = parseInt(req.nextUrl.searchParams.get('bowler_id') || '');

    if (isNaN(batterId) || isNaN(bowlerId)) {
      return apiError(
        'Both batter_id and bowler_id are required as query parameters',
        'INVALID_PARAM',
        400
      );
    }

    const cacheKey = CacheKeys.matchup(batterId, bowlerId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 600);

    const matchup = await getMatchup(batterId, bowlerId);

    if (!matchup) {
      return apiError('No matchup data found for this pair', 'NOT_FOUND', 404);
    }

    await cacheSet(cacheKey, matchup, 3600);
    return apiSuccess(matchup);
  });
}
