import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { computeFormScore } from '@/lib/analytics/form-score';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import { queryOne } from '@/lib/db/supabase';
import type { Player, FormScoreResult } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(req, async () => {
    const playerId = parseInt(params.id, 10);
    if (isNaN(playerId)) return apiError('Invalid player ID', 400, 'INVALID_ID');

    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'overall';

    const cacheKey = CacheKeys.playerForm(playerId, type);
    const cached = await cacheGet<FormScoreResult>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const player = await queryOne<Player>('players', 'id', playerId);
    if (!player) return apiError('Player not found', 404, 'NOT_FOUND');

    const result = await computeFormScore(playerId, player.role || 'batter');
    await cacheSet(cacheKey, result, 1800);

    return apiSuccess(result);
  });
}
