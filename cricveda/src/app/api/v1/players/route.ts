import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { queryMany } from '@/lib/db/supabase';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { Player } from '@/lib/types';

export async function GET(req: NextRequest) {
  return withOptionalAuth(req, async (req) => {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    const country = url.searchParams.get('country') || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20', 10), 50);

    const cacheKey = CacheKeys.playerList(page);
    const cached = await cacheGet<{ data: Player[]; count: number }>(cacheKey);
    if (cached && !search && !role && !country) {
      return apiSuccess(cached, true);
    }

    const filters: Record<string, string> = {};
    if (role) filters.role = role;
    if (country) filters.country = country;

    const result = await queryMany<Player>('players', filters, {
      page,
      perPage,
      orderBy: 'name',
      ascending: true,
    });

    if (!search) {
      await cacheSet(cacheKey, result, 300);
    }

    return apiSuccess({
      players: result.data,
      pagination: {
        page,
        per_page: perPage,
        total: result.count,
        total_pages: Math.ceil(result.count / perPage),
      },
    });
  });
}
