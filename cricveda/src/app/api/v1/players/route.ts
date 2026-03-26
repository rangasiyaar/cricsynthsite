// GET /api/v1/players — List players with search/filter
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { cacheGet, cacheSet } from '@/lib/cache/redis';

export async function GET(request: NextRequest) {
  return withOptionalAuth(request, async (req) => {
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role');
    const country = searchParams.get('country');
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20'), 100);
    const offset = (page - 1) * perPage;

    // Cache key
    const cacheKey = `players:${search}:${role}:${country}:p${page}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 120);

    const db = getSupabaseClient();
    let query = db.from('players').select('id, name, country, role, batting_style, bowling_style, t20_matches', { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (role && role !== 'all') {
      query = query.eq('role', role);
    }
    if (country) {
      query = query.eq('country', country);
    }

    query = query.order('t20_matches', { ascending: false });
    query = query.range(offset, offset + perPage - 1);

    const { data, error, count } = await query;

    if (error) {
      return apiError('Failed to fetch players', 'DB_ERROR', 500);
    }

    const result = {
      items: data || [],
      total: count || 0,
      page,
      per_page: perPage,
      has_more: (count || 0) > offset + perPage,
    };

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
