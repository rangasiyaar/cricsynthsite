// GET /api/v1/players/[id]/form — Cross-league form score
import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { calculateFormScore } from '@/lib/analytics/form-score';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(request, async (req) => {
    const playerId = parseInt(params.id);
    if (isNaN(playerId)) {
      return apiError('Invalid player ID', 'INVALID_PARAM', 400);
    }

    const scoreType = (req.nextUrl.searchParams.get('type') || 'overall') as 'batting' | 'bowling' | 'overall';

    const cacheKey = CacheKeys.playerForm(playerId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 300);

    const formScore = await calculateFormScore(playerId, scoreType);

    if (!formScore) {
      return apiError('Player not found or no data', 'NOT_FOUND', 404);
    }

    await cacheSet(cacheKey, formScore, 1800);
    return apiSuccess(formScore);
  });
}
