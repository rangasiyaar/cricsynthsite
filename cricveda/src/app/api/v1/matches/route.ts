// GET /api/v1/matches — List upcoming and recent matches
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(request: NextRequest) {
  return withOptionalAuth(request, async (req) => {
    const searchParams = req.nextUrl.searchParams;
    const league = searchParams.get('league');
    const status = searchParams.get('status') || 'upcoming';
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20'), 50);
    const offset = (page - 1) * perPage;

    const cacheKey = CacheKeys.matchList(league || undefined, page);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 60);

    const db = getSupabaseClient();
    let query = db
      .from('fixtures')
      .select(`
        id, league_id, season, match_number, date, time, status, insights_ready,
        team1_id, team2_id, venue_id
      `, { count: 'exact' });

    if (league && league !== 'all') {
      query = query.eq('league_id', league);
    }

    if (status === 'upcoming') {
      query = query.in('status', ['upcoming', 'live']);
      query = query.order('date', { ascending: true });
    } else {
      query = query.eq('status', status);
      query = query.order('date', { ascending: false });
    }

    query = query.range(offset, offset + perPage - 1);

    const { data: fixtures, error, count } = await query;

    if (error) {
      return apiError('Failed to fetch matches', 'DB_ERROR', 500);
    }

    // Enrich with team and venue names
    if (fixtures && fixtures.length > 0) {
      const teamIds = [...new Set(fixtures.flatMap((f: Record<string, unknown>) => [f.team1_id, f.team2_id]).filter(Boolean))] as number[];
      const venueIds = [...new Set(fixtures.map((f: Record<string, unknown>) => f.venue_id).filter(Boolean))] as number[];

      const [{ data: teams }, { data: venues }] = await Promise.all([
        db.from('teams').select('id, name, short_name').in('id', teamIds),
        db.from('venues').select('id, name, city').in('id', venueIds),
      ]);

      const teamMap = new Map();
      teams?.forEach((t: Record<string, unknown>) => teamMap.set(t.id, t));
      const venueMap = new Map();
      venues?.forEach((v: Record<string, unknown>) => venueMap.set(v.id, v));

      const enriched = fixtures.map((f: Record<string, unknown>) => ({
        ...f,
        team1: teamMap.get(f.team1_id) || null,
        team2: teamMap.get(f.team2_id) || null,
        venue: venueMap.get(f.venue_id) || null,
      }));

      const result = {
        items: enriched,
        total: count || 0,
        page,
        per_page: perPage,
        has_more: (count || 0) > offset + perPage,
      };

      await cacheSet(cacheKey, result, 120);
      return apiSuccess(result);
    }

    const result = {
      items: [],
      total: 0,
      page,
      per_page: perPage,
      has_more: false,
    };

    return apiSuccess(result);
  });
}
