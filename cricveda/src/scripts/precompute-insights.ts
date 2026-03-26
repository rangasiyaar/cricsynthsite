// ============================================================
// CricVeda — Pre-computation Engine (F1.5)
// ============================================================
// Computes and caches insights for all upcoming fixtures.
// Run via cron (daily) or admin panel (on-demand).

import { getSupabaseClient } from '@/lib/db/supabase';
import { computeAllFormScores } from '@/lib/analytics/form-score';
import { generateDreamTeam, getCaptainPicks, getDifferentials } from '@/lib/analytics/fantasy';
import { getKeyBattles } from '@/lib/analytics/matchup';
import { getVenueIntelligence } from '@/lib/analytics/venue';

export async function precomputeAllInsights(): Promise<{
  fixtures_processed: number;
  form_scores_computed: number;
  errors: string[];
}> {
  const startTime = Date.now();
  const stats = { fixtures_processed: 0, form_scores_computed: 0, errors: [] as string[] };
  const db = getSupabaseClient();

  console.log('[Precompute] Starting full insight pre-computation...');

  // Step 1: Compute form scores for all players
  try {
    stats.form_scores_computed = await computeAllFormScores();
    console.log(`[Precompute] Form scores: ${stats.form_scores_computed}`);
  } catch (err) {
    stats.errors.push(`Form score computation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Get upcoming fixtures
  const { data: fixtures } = await db
    .from('fixtures')
    .select('id, venue_id')
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })
    .limit(20);

  if (!fixtures || fixtures.length === 0) {
    console.log('[Precompute] No upcoming fixtures to process');
    return stats;
  }

  // Step 3: Process each fixture
  for (const fixture of fixtures) {
    try {
      const fixtureId = fixture.id;
      console.log(`[Precompute] Processing fixture ${fixtureId}...`);

      // Venue intelligence
      if (fixture.venue_id) {
        const venueData = await getVenueIntelligence(fixture.venue_id);
        if (venueData) {
          await storeInsight(db, fixtureId, 'venue_analysis', venueData, venueData.confidence);
        }
      }

      // Dream team
      const dreamTeam = await generateDreamTeam(fixtureId);
      if (dreamTeam) {
        await storeInsight(db, fixtureId, 'dream_team', dreamTeam, dreamTeam.confidence);
      }

      // Captain picks
      const captainPicks = await getCaptainPicks(fixtureId);
      if (captainPicks.length > 0) {
        await storeInsight(db, fixtureId, 'captain_picks', captainPicks, 0.7);
      }

      // Key battles
      const keyBattles = await getKeyBattles(fixtureId);
      if (keyBattles.length > 0) {
        await storeInsight(db, fixtureId, 'key_battles', keyBattles, 0.75);
      }

      // Differentials
      const differentials = await getDifferentials(fixtureId);
      if (differentials.length > 0) {
        await storeInsight(db, fixtureId, 'differentials', differentials, 0.6);
      }

      // Mark fixture as insights ready
      await db
        .from('fixtures')
        .update({ insights_ready: true })
        .eq('id', fixtureId);

      stats.fixtures_processed++;
    } catch (err) {
      stats.errors.push(`Fixture ${fixture.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Precompute] Complete in ${elapsed}s: ${stats.fixtures_processed} fixtures, ${stats.form_scores_computed} form scores`);

  return stats;
}

async function storeInsight(
  db: ReturnType<typeof getSupabaseClient>,
  fixtureId: number,
  type: string,
  data: unknown,
  confidence: number
) {
  await db.from('precomputed_insights').upsert(
    {
      fixture_id: fixtureId,
      insight_type: type,
      data,
      confidence,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'fixture_id,insight_type' }
  );
}

// ─── SINGLE MATCH RECOMPUTE ───

export async function recomputeForFixture(fixtureId: number): Promise<boolean> {
  const db = getSupabaseClient();

  const { data: fixture } = await db
    .from('fixtures')
    .select('id, venue_id')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return false;

  try {
    if (fixture.venue_id) {
      const venueData = await getVenueIntelligence(fixture.venue_id);
      if (venueData) await storeInsight(db, fixtureId, 'venue_analysis', venueData, venueData.confidence);
    }

    const dreamTeam = await generateDreamTeam(fixtureId);
    if (dreamTeam) await storeInsight(db, fixtureId, 'dream_team', dreamTeam, dreamTeam.confidence);

    const captainPicks = await getCaptainPicks(fixtureId);
    if (captainPicks.length > 0) await storeInsight(db, fixtureId, 'captain_picks', captainPicks, 0.7);

    const keyBattles = await getKeyBattles(fixtureId);
    if (keyBattles.length > 0) await storeInsight(db, fixtureId, 'key_battles', keyBattles, 0.75);

    const differentials = await getDifferentials(fixtureId);
    if (differentials.length > 0) await storeInsight(db, fixtureId, 'differentials', differentials, 0.6);

    await db.from('fixtures').update({ insights_ready: true }).eq('id', fixtureId);
    return true;
  } catch {
    return false;
  }
}
