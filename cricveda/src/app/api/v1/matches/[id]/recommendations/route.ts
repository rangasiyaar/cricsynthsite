import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/middleware';
import { generateDreamTeam, getCaptainPicks, getDifferentials } from '@/lib/analytics/fantasy';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async () => {
    const fixtureId = parseInt(params.id, 10);
    if (isNaN(fixtureId)) return apiError('Invalid match ID', 400, 'INVALID_ID');

    const [dreamTeam, captainPicks, differentials] = await Promise.all([
      generateDreamTeam(fixtureId),
      getCaptainPicks(fixtureId),
      getDifferentials(fixtureId),
    ]);

    return apiSuccess({
      fixture_id: fixtureId,
      dream_team: dreamTeam,
      captain_picks: captainPicks,
      differentials,
    });
  });
}
