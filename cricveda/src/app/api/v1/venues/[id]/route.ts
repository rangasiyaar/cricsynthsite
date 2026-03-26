// GET /api/v1/venues/[id] — Venue intelligence
import { NextRequest } from 'next/server';
import { withOptionalAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getVenueIntelligence } from '@/lib/analytics/venue';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withOptionalAuth(request, async () => {
    const venueId = parseInt(params.id);
    if (isNaN(venueId)) {
      return apiError('Invalid venue ID', 'INVALID_PARAM', 400);
    }

    const cacheKey = CacheKeys.venueStats(venueId);
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return apiSuccess(cached, true, 600);

    const venue = await getVenueIntelligence(venueId);

    if (!venue) {
      return apiError('Venue not found', 'NOT_FOUND', 404);
    }

    await cacheSet(cacheKey, venue, 3600);
    return apiSuccess(venue);
  });
}
