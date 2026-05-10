import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { queryOne } from '@/lib/db/supabase';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { Player } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(req, async () => {
    const playerId = parseInt(params.id, 10);
    if (isNaN(playerId)) return apiError('Invalid player ID', 400, 'INVALID_ID');

    const cacheKey = CacheKeys.player(playerId);
    const cached = await cacheGet<Player>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const player = await queryOne<Player>('players', 'id', playerId);
    if (!player) return apiError('Player not found', 404, 'NOT_FOUND');

    await cacheSet(cacheKey, player, 600);
    return apiSuccess(player);
  });
}
