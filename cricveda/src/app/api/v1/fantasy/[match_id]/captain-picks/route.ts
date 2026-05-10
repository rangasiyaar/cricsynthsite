import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getCaptainPicks } from '@/lib/analytics/fantasy';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { CaptainPick } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { match_id: string } }
) {
  return withAuth(req, async () => {
    const fixtureId = parseInt(params.match_id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const cacheKey = CacheKeys.captainPicks(fixtureId);
    const cached = await cacheGet<CaptainPick[]>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const picks = await getCaptainPicks(fixtureId);
    await cacheSet(cacheKey, picks, 300);

    return apiSuccess({ fixture_id: fixtureId, captain_picks: picks });
  });
}
