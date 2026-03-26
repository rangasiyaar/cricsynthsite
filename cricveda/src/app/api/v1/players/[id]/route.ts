// GET /api/v1/players/[id] — Player profile
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(request, async () => {
    const playerId = parseInt(params.id);
    if (isNaN(playerId)) {
      return apiError('Invalid player ID', 'INVALID_PARAM', 400);
    }

    const cacheKey = CacheKeys.playerProfile(playerId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 120);

    const db = getSupabaseClient();
    const { data: player, error } = await db
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (error || !player) {
      return apiError('Player not found', 'NOT_FOUND', 404);
    }

    // Get form scores
    const { data: formScores } = await db
      .from('form_scores')
      .select('score_type, score, trend, confidence, matches_used, leagues_used, computed_at')
      .eq('player_id', playerId);

    const result = {
      ...player,
      form: formScores || [],
    };

    await cacheSet(cacheKey, result, 600);
    return apiSuccess(result);
  });
}
