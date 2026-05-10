import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { queryOne, queryMany } from '@/lib/db/supabase';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { PrecomputedInsight } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(req, async () => {
    const fixtureId = parseInt(params.id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const cacheKey = CacheKeys.matchInsights(fixtureId);
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    // Check fixture exists
    const fixture = await queryOne<Record<string, unknown>>('fixtures', 'id', fixtureId);
    if (!fixture) return apiError('Match not found', 404, 'NOT_FOUND');

    // Get all precomputed insights
    const { data: insights } = await queryMany<PrecomputedInsight>('precomputed_insights', {
      fixture_id: fixtureId,
    });

    const result: Record<string, unknown> = {
      fixture_id: fixtureId,
      insights: {},
    };

    for (const insight of insights) {
      result[insight.insight_type] = {
        data: insight.data,
        confidence: insight.confidence,
        computed_at: insight.computed_at,
      };
    }

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
