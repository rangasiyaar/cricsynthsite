import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { generateDreamTeam } from '@/lib/analytics/fantasy';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { DreamTeamResult } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { match_id: string } }
) {
  return withAuth(req, async () => {
    const fixtureId = parseInt(params.match_id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const cacheKey = CacheKeys.dreamTeam(fixtureId);
    const cached = await cacheGet<DreamTeamResult>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const result = await generateDreamTeam(fixtureId);
    if (!result) return apiError('Dream team data not available for this match', 404, 'NO_DATA');

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
