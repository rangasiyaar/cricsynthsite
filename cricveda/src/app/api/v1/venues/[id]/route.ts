import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getVenueIntelligence } from '@/lib/analytics/venue';
import { cacheGet, cacheSet, CacheKeys } from '@/lib/cache/redis';
import type { VenueIntelligence } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async () => {
    const venueId = parseInt(params.id, 10);
    if (isNaN(venueId)) return apiError('Invalid venue ID', 400, 'INVALID_ID');

    const cacheKey = CacheKeys.venue(venueId);
    const cached = await cacheGet<VenueIntelligence>(cacheKey);
    if (cached) return apiSuccess(cached, true);

    const result = await getVenueIntelligence(venueId);
    if (!result) return apiError('Venue not found or no data available', 404, 'NOT_FOUND');

    await cacheSet(cacheKey, result, 300);
    return apiSuccess(result);
  });
}
