// ============================================================
// CricVeda — Venue Intelligence (F2.3)
// ============================================================

import { getServiceClient } from '@/lib/db/supabase';
import { computeVenueConfidence } from '@/lib/analytics/confidence';
import type { VenueIntelligence } from '@/lib/types';

// ─── Pace/Spin Detection Keywords ───

const PACE_KEYWORDS = ['fast', 'medium', 'pace', 'seam', 'swing'];
const SPIN_KEYWORDS = ['spin', 'off', 'leg', 'left-arm orthodox', 'left-arm wrist', 'slow'];

function isPaceBowler(style: string | null): boolean {
  if (!style) return true;
  return PACE_KEYWORDS.some(kw => style.toLowerCase().includes(kw));
}

// ─── Compute Venue Intelligence ───

export async function getVenueIntelligence(venueId: number): Promise<VenueIntelligence | null> {
  const db = getServiceClient();

  // Get all matches at this venue
  const { data: matches, error } = await db
    .from('matches')
    .select('id, winner_id, team1_id, team2_id, toss_decision, date')
    .eq('venue_id', venueId);

  if (error || !matches || matches.length === 0) return null;

  const matchIds = matches.map((m: Record<string, unknown>) => m.id as number);

  // Get all deliveries for these matches
  const { data: deliveries } = await db
    .from('deliveries')
    .select('*, players!deliveries_bowler_id_fkey(bowling_style)')
    .in('match_id', matchIds);

  if (!deliveries) return null;

  // ─── Avg Scores ───
  const innings1: Record<number, number> = {};
  const innings2: Record<number, number> = {};

  for (const d of deliveries) {
    const del = d as Record<string, unknown>;
    const matchId = del.match_id as number;
    const innings = del.innings as number;
    const runs = del.runs_total as number;

    if (innings === 1) {
      innings1[matchId] = (innings1[matchId] || 0) + runs;
    } else {
      innings2[matchId] = (innings2[matchId] || 0) + runs;
    }
  }

  const avg1 = Object.values(innings1);
  const avg2 = Object.values(innings2);
  const avgFirstInnings = avg1.length > 0 ? Math.round(avg1.reduce((s, v) => s + v, 0) / avg1.length) : 0;
  const avgSecondInnings = avg2.length > 0 ? Math.round(avg2.reduce((s, v) => s + v, 0) / avg2.length) : 0;

  // ─── Pace vs Spin Wickets ───
  const wickets = deliveries.filter((d: Record<string, unknown>) => d.is_wicket === true);
  let paceWickets = 0;
  let spinWickets = 0;

  for (const w of wickets) {
    const wk = w as Record<string, unknown>;
    const bowler = wk.players as Record<string, unknown> | undefined;
    const style = bowler?.bowling_style as string | null;
    if (isPaceBowler(style)) paceWickets++;
    else spinWickets++;
  }

  const totalWickets = paceWickets + spinWickets;
  const paceWicketPct = totalWickets > 0 ? Math.round((paceWickets / totalWickets) * 100) : 50;
  const spinWicketPct = totalWickets > 0 ? Math.round((spinWickets / totalWickets) * 100) : 50;

  // ─── Toss / Chasing Stats ───
  let batFirstCount = 0;
  let chasingWins = 0;
  let chasingTotal = 0;

  for (const m of matches) {
    const match = m as Record<string, unknown>;
    if (match.toss_decision === 'bat') batFirstCount++;

    // Check if chasing team won
    if (match.winner_id && match.team1_id && match.team2_id) {
      chasingTotal++;
      // The team batting second is the chasing team
      // If toss winner chose to bat, the other team chases
      // Simplified: count wins vs total
      if (match.winner_id !== match.team1_id) chasingWins++;
    }
  }

  const batFirstPct = matches.length > 0 ? Math.round((batFirstCount / matches.length) * 100) : 50;
  const chasingWinPct = chasingTotal > 0 ? Math.round((chasingWins / chasingTotal) * 100) : 50;

  // ─── Phase Breakdown ───
  const phaseData: Record<string, { runs: number; wickets: number; count: number }> = {
    powerplay: { runs: 0, wickets: 0, count: 0 },
    middle: { runs: 0, wickets: 0, count: 0 },
    death: { runs: 0, wickets: 0, count: 0 },
  };

  for (const d of deliveries) {
    const del = d as Record<string, unknown>;
    const phase = del.phase as string;
    if (phaseData[phase]) {
      phaseData[phase].runs += del.runs_total as number;
      if (del.is_wicket) phaseData[phase].wickets++;
      phaseData[phase].count++;
    }
  }

  const matchCount = matches.length;
  const phaseBreakdown = {
    powerplay: {
      avg_runs: matchCount > 0 ? Math.round(phaseData.powerplay.runs / matchCount) : 0,
      avg_wickets: matchCount > 0 ? Math.round((phaseData.powerplay.wickets / matchCount) * 10) / 10 : 0,
    },
    middle: {
      avg_runs: matchCount > 0 ? Math.round(phaseData.middle.runs / matchCount) : 0,
      avg_wickets: matchCount > 0 ? Math.round((phaseData.middle.wickets / matchCount) * 10) / 10 : 0,
    },
    death: {
      avg_runs: matchCount > 0 ? Math.round(phaseData.death.runs / matchCount) : 0,
      avg_wickets: matchCount > 0 ? Math.round((phaseData.death.wickets / matchCount) * 10) / 10 : 0,
    },
  };

  // Confidence
  const dates = matches.map((m: Record<string, unknown>) => m.date as string).sort().reverse();
  const daysSince = dates.length > 0
    ? Math.floor((Date.now() - new Date(dates[0]).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const confidence = computeVenueConfidence(matchCount, daysSince);

  return {
    venue_id: venueId,
    matches_analyzed: matchCount,
    avg_first_innings_score: avgFirstInnings,
    avg_second_innings_score: avgSecondInnings,
    pace_wicket_pct: paceWicketPct,
    spin_wicket_pct: spinWicketPct,
    bat_first_pct: batFirstPct,
    chasing_win_pct: chasingWinPct,
    phase_breakdown: phaseBreakdown,
    confidence,
  };
}
