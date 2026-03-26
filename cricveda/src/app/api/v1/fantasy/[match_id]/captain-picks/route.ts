// GET /api/v1/fantasy/[match_id]/captain-picks — Top 3 captain recommendations
import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getCaptainPicks } from '@/lib/analytics/fantasy';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { match_id: string } }
) {
  return withAuth(request, async () => {
    const fixtureId = parseInt(params.match_id);
    if (isNaN(fixtureId)) {
      return apiError('Invalid match ID', 'INVALID_PARAM', 400);
    }

    const cacheKey = CacheKeys.captainPicks(fixtureId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 300);

    const picks = await getCaptainPicks(fixtureId);

    if (!picks || picks.length === 0) {
      return apiError(
        'Unable to generate captain picks. Playing XI may not be available yet.',
        'INSUFFICIENT_DATA',
        404
      );
    }

    await cacheSet(cacheKey, picks, 900);
    return apiSuccess(picks);
  });
}
