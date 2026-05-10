import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { getKeyBattles } from '@/lib/analytics/matchup';

export async function GET(
  req: NextRequest,
  { params }: { params: { match_id: string } }
) {
  return withAuth(req, async () => {
    const fixtureId = parseInt(params.match_id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const battles = await getKeyBattles(fixtureId);
    return apiSuccess({ fixture_id: fixtureId, key_battles: battles });
  });
}
