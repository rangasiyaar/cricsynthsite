// ============================================================
// CricVeda — Venue Intelligence (F2.3)
// ============================================================

import { getSupabaseClient } from '@/lib/db/supabase';
import { VenueIntelligence } from '@/lib/types';
import { computeVenueConfidence } from '@/lib/analytics/confidence';

export async function getVenueIntelligence(
  venueId: number
): Promise<VenueIntelligence | null> {
  const db = getSupabaseClient();

  // Get venue info
  const { data: venue } = await db
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single();

  if (!venue) return null;

  // Get all completed matches at this venue
  const { data: matches } = await db
    .from('matches')
    .select('id, team1_score, team2_score, toss_decision, winner_id, team1_id, team2_id, toss_winner_id, date')
    .eq('venue_id', venueId)
    .eq('is_completed', true);

  if (!matches || matches.length === 0) {
    return {
      venue_id: venueId,
      venue_name: venue.name,
      city: venue.city,
      matches_analyzed: 0,
      avg_1st_innings: 0,
      avg_2nd_innings: 0,
      pace_wicket_pct: 50,
      spin_wicket_pct: 50,
      toss_bat_first_pct: 50,
      chasing_win_pct: 50,
      phase_breakdown: {
        powerplay: { avg_runs: 0, avg_wickets: 0 },
        middle: { avg_runs: 0, avg_wickets: 0 },
        death: { avg_runs: 0, avg_wickets: 0 },
      },
      confidence: 0.1,
    };
  }

  // Compute averages
  const validMatches = matches.filter(
    (m: Record<string, unknown>) => m.team1_score && m.team2_score
  );
  const n = validMatches.length;

  const avg1st = n > 0
    ? validMatches.reduce((s: number, m: Record<string, unknown>) => s + (m.team1_score as number), 0) / n
    : 0;
  const avg2nd = n > 0
    ? validMatches.reduce((s: number, m: Record<string, unknown>) => s + (m.team2_score as number), 0) / n
    : 0;

  // Toss decisions
  const tossBatFirst = matches.filter(
    (m: Record<string, unknown>) => m.toss_decision === 'bat'
  ).length;
  const tossBatPct = matches.length > 0 ? (tossBatFirst / matches.length) * 100 : 50;

  // Chasing win %
  const chasingWins = validMatches.filter((m: Record<string, unknown>) => {
    const battedFirst = m.toss_decision === 'bat' ? m.toss_winner_id : 
      (m.toss_winner_id === m.team1_id ? m.team2_id : m.team1_id);
    return m.winner_id && m.winner_id !== battedFirst;
  }).length;
  const chasingWinPct = n > 0 ? (chasingWins / n) * 100 : 50;

  // Phase breakdown from deliveries
  const matchIds = matches.map((m: Record<string, unknown>) => m.id as number);
  const phaseBreakdown = await computePhaseBreakdown(matchIds);

  // Pace vs spin from wickets
  const { pacePct, spinPct } = await computePaceSpinSplit(matchIds);

  // Confidence
  const mostRecentDate = matches
    .map((m: Record<string, unknown>) => m.date as string)
    .sort()
    .pop();
  const confidence = computeVenueConfidence(n, mostRecentDate);

  return {
    venue_id: venueId,
    venue_name: venue.name,
    city: venue.city,
    matches_analyzed: n,
    avg_1st_innings: Math.round(avg1st * 10) / 10,
    avg_2nd_innings: Math.round(avg2nd * 10) / 10,
    pace_wicket_pct: Math.round(pacePct * 10) / 10,
    spin_wicket_pct: Math.round(spinPct * 10) / 10,
    toss_bat_first_pct: Math.round(tossBatPct * 10) / 10,
    chasing_win_pct: Math.round(chasingWinPct * 10) / 10,
    phase_breakdown: phaseBreakdown,
    confidence: confidence.value,
  };
}

async function computePhaseBreakdown(matchIds: number[]) {
  const db = getSupabaseClient();

  const phases = ['powerplay', 'middle', 'death'] as const;
  const result: Record<string, { avg_runs: number; avg_wickets: number }> = {};

  for (const phase of phases) {
    const { data } = await db
      .from('deliveries')
      .select('match_id, innings, runs_total, is_wicket')
      .in('match_id', matchIds)
      .eq('phase', phase);

    if (data && data.length > 0) {
      // Group by match+innings
      const groups = new Map<string, { runs: number; wickets: number }>();
      data.forEach((d: Record<string, unknown>) => {
        const key = `${d.match_id}-${d.innings}`;
        const group = groups.get(key) || { runs: 0, wickets: 0 };
        group.runs += d.runs_total as number;
        group.wickets += d.is_wicket ? 1 : 0;
        groups.set(key, group);
      });

      const entries = Array.from(groups.values());
      const totalRuns = entries.reduce((s, e) => s + e.runs, 0);
      const totalWickets = entries.reduce((s, e) => s + e.wickets, 0);

      result[phase] = {
        avg_runs: Math.round((totalRuns / entries.length) * 10) / 10,
        avg_wickets: Math.round((totalWickets / entries.length) * 100) / 100,
      };
    } else {
      result[phase] = { avg_runs: 0, avg_wickets: 0 };
    }
  }

  return result as VenueIntelligence['phase_breakdown'];
}

async function computePaceSpinSplit(matchIds: number[]) {
  const db = getSupabaseClient();

  // Get wicket deliveries and join with bowler bowling style
  const { data: wickets } = await db
    .from('deliveries')
    .select('bowler_id, is_wicket')
    .in('match_id', matchIds)
    .eq('is_wicket', true);

  if (!wickets || wickets.length === 0) {
    return { pacePct: 50, spinPct: 50 };
  }

  const bowlerIds = [...new Set(wickets.map((w: Record<string, unknown>) => w.bowler_id as number))];
  const { data: bowlers } = await db
    .from('players')
    .select('id, bowling_style')
    .in('id', bowlerIds);

  const styleMap = new Map<number, string>();
  bowlers?.forEach((b: Record<string, unknown>) => {
    styleMap.set(b.id as number, b.bowling_style as string || 'unknown');
  });

  let paceWickets = 0;
  let spinWickets = 0;

  wickets.forEach((w: Record<string, unknown>) => {
    const style = styleMap.get(w.bowler_id as number) || 'unknown';
    if (style.includes('fast') || style.includes('medium') || style.includes('pace')) {
      paceWickets++;
    } else if (style.includes('spin') || style.includes('orthodox') || style.includes('wrist') || style.includes('leg') || style.includes('off')) {
      spinWickets++;
    } else {
      paceWickets += 0.5;
      spinWickets += 0.5;
    }
  });

  const total = paceWickets + spinWickets;
  return {
    pacePct: total > 0 ? (paceWickets / total) * 100 : 50,
    spinPct: total > 0 ? (spinWickets / total) * 100 : 50,
  };
}
