import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { queryOne } from '@/lib/db/supabase';
import type { Prediction } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { match_id: string } }
) {
  return withAuth(req, async () => {
    const fixtureId = parseInt(params.match_id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const prediction = await queryOne<Prediction>('predictions', 'fixture_id', fixtureId);
    if (!prediction) {
      return apiError('No prediction available for this match', 404, 'NO_DATA');
    }

    return apiSuccess(prediction);
  });
}
