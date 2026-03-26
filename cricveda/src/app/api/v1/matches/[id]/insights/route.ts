// GET /api/v1/matches/[id]/insights — Match insights (venue, H2H, predictions)
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import { getVenueIntelligence } from '@/lib/analytics/venue';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(request, async () => {
    const fixtureId = parseInt(params.id);
    if (isNaN(fixtureId)) {
      return apiError('Invalid match ID', 'INVALID_PARAM', 400);
    }

    const cacheKey = CacheKeys.fixtureInsight(fixtureId, 'match_insights');
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 300);

    const db = getSupabaseClient();

    // Get fixture
    const { data: fixture } = await db
      .from('fixtures')
      .select('*')
      .eq('id', fixtureId)
      .single();

    if (!fixture) {
      return apiError('Match not found', 'NOT_FOUND', 404);
    }

    // Check for precomputed insights
    const { data: precomputed } = await db
      .from('precomputed_insights')
      .select('insight_type, data, confidence, computed_at')
      .eq('fixture_id', fixtureId);

    // Get venue intelligence
    let venueInsight = null;
    if (fixture.venue_id) {
      venueInsight = await getVenueIntelligence(fixture.venue_id);
    }

    // Get team info
    const [{ data: team1 }, { data: team2 }] = await Promise.all([
      db.from('teams').select('*').eq('id', fixture.team1_id).single(),
      db.from('teams').select('*').eq('id', fixture.team2_id).single(),
    ]);

    // Team H2H from completed matches
    const { data: h2hMatches } = await db
      .from('matches')
      .select('winner_id, date, team1_score, team2_score')
      .or(`and(team1_id.eq.${fixture.team1_id},team2_id.eq.${fixture.team2_id}),and(team1_id.eq.${fixture.team2_id},team2_id.eq.${fixture.team1_id})`)
      .eq('is_completed', true)
      .order('date', { ascending: false })
      .limit(10);

    const team1Wins = h2hMatches?.filter((m: Record<string, unknown>) => m.winner_id === fixture.team1_id).length || 0;
    const team2Wins = h2hMatches?.filter((m: Record<string, unknown>) => m.winner_id === fixture.team2_id).length || 0;

    const result = {
      fixture: {
        id: fixture.id,
        date: fixture.date,
        time: fixture.time,
        status: fixture.status,
        league_id: fixture.league_id,
      },
      team1: team1 || null,
      team2: team2 || null,
      venue: venueInsight,
      head_to_head: {
        total_matches: h2hMatches?.length || 0,
        team1_wins: team1Wins,
        team2_wins: team2Wins,
        draws: (h2hMatches?.length || 0) - team1Wins - team2Wins,
        recent_matches: h2hMatches?.slice(0, 5) || [],
      },
      precomputed_insights: precomputed?.reduce((acc: Record<string, unknown>, p: Record<string, unknown>) => {
        acc[p.insight_type as string] = {
          data: p.data,
          confidence: p.confidence,
          computed_at: p.computed_at,
        };
        return acc;
      }, {}) || {},
    };

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
