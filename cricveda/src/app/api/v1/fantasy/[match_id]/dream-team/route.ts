// GET /api/v1/fantasy/[match_id]/dream-team — Dream team generator
import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { generateDreamTeam } from '@/lib/analytics/fantasy';
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

    const cacheKey = CacheKeys.dreamTeam(fixtureId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 300);

    const dreamTeam = await generateDreamTeam(fixtureId);

    if (!dreamTeam) {
      return apiError(
        'Unable to generate dream team. Playing XI may not be available yet.',
        'INSUFFICIENT_DATA',
        404
      );
    }

    await cacheSet(cacheKey, dreamTeam, 900);
    return apiSuccess(dreamTeam);
  });
}
