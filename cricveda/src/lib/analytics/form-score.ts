// ============================================================
// CricVeda — Cross-League Form Score Calculator (F2.1)
// ============================================================
// Computes a 0–10 score representing a player's recent T20 form
// across all leagues.

import { getServiceClient } from '@/lib/db/supabase';
import { computeFormConfidence } from '@/lib/analytics/confidence';
import type { FormScoreResult, Delivery, Match } from '@/lib/types';

const DECAY_FACTOR = 0.92;
const MAX_MATCHES = 20;

// ─── Performance Data ───

interface MatchPerformance {
  match_id: number;
  league_id: string;
  date: string;
  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  wickets: number;
  balls_bowled: number;
  runs_conceded: number;
  dots_bowled: number;
}

// ─── Fetch Recent Performances ───

async function getRecentPerformances(
  playerId: number,
  limit: number = MAX_MATCHES
): Promise<MatchPerformance[]> {
  const db = getServiceClient();

  // Get matches where player batted or bowled
  const { data: matchIds, error: matchErr } = await db
    .from('deliveries')
    .select('match_id')
    .or(`batter_id.eq.${playerId},bowler_id.eq.${playerId}`)
    .order('match_id', { ascending: false });

  if (matchErr || !matchIds) return [];

  const uniqueMatchIds = [...new Set(matchIds.map((d: Record<string, unknown>) => d.match_id as number))].slice(0, limit);

  if (uniqueMatchIds.length === 0) return [];

  const performances: MatchPerformance[] = [];

  for (const matchId of uniqueMatchIds) {
    const { data: match } = await db
      .from('matches')
      .select('league_id, date')
      .eq('id', matchId)
      .single();

    if (!match) continue;

    const { data: deliveries } = await db
      .from('deliveries')
      .select('*')
      .eq('match_id', matchId);

    if (!deliveries) continue;

    const batting = (deliveries as Delivery[]).filter(d => d.batter_id === playerId);
    const bowling = (deliveries as Delivery[]).filter(d => d.bowler_id === playerId);

    performances.push({
      match_id: matchId,
      league_id: (match as Match).league_id,
      date: (match as Match).date,
      runs: batting.reduce((s, d) => s + d.runs_batter, 0),
      balls_faced: batting.length,
      fours: batting.filter(d => d.runs_batter === 4).length,
      sixes: batting.filter(d => d.runs_batter === 6).length,
      wickets: bowling.filter(d => d.is_wicket).length,
      balls_bowled: bowling.length,
      runs_conceded: bowling.reduce((s, d) => s + d.runs_total, 0),
      dots_bowled: bowling.filter(d => d.runs_total === 0).length,
    });
  }

  return performances;
}

// ─── Batting Sub-Score ───

function computeBattingScore(performances: MatchPerformance[]): number {
  if (performances.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  performances.forEach((perf, i) => {
    const weight = Math.pow(DECAY_FACTOR, i);
    weightTotal += weight;

    // Runs component (30%) — normalized against 60
    const runsScore = Math.min(perf.runs / 60, 1.0) * 0.30;

    // Strike rate component (25%) — normalized range 80–180
    const sr = perf.balls_faced > 0 ? (perf.runs / perf.balls_faced) * 100 : 0;
    const srScore = Math.max(0, Math.min((sr - 80) / 100, 1.0)) * 0.25;

    // Boundary percentage (15%) — normalized against 30%
    const boundaryPct = perf.balls_faced > 0
      ? ((perf.fours + perf.sixes) / perf.balls_faced) * 100
      : 0;
    const boundaryScore = Math.min(boundaryPct / 30, 1.0) * 0.15;

    // Impact innings (10%) — 50+ = 1.0, 30+ = 0.7, 15+ = 0.4
    let impactScore = 0;
    if (perf.runs >= 50) impactScore = 1.0;
    else if (perf.runs >= 30) impactScore = 0.7;
    else if (perf.runs >= 15) impactScore = 0.4;
    impactScore *= 0.10;

    // Consistency bonus (20%) — higher if scoring regularly
    const consistencyScore = (perf.runs >= 10 ? 0.6 : 0.2) * 0.20;

    const matchScore = runsScore + srScore + boundaryScore + impactScore + consistencyScore;
    weightedSum += matchScore * weight;
  });

  return (weightedSum / weightTotal) * 10;
}

// ─── Bowling Sub-Score ───

function computeBowlingScore(performances: MatchPerformance[]): number {
  if (performances.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  performances.forEach((perf, i) => {
    if (perf.balls_bowled === 0) return;

    const weight = Math.pow(DECAY_FACTOR, i);
    weightTotal += weight;

    // Wickets (30%) — normalized against 3
    const wicketScore = Math.min(perf.wickets / 3, 1.0) * 0.30;

    // Economy (25%) — inverse, 6.0 econ = 1.0, 12.0 = 0.0
    const economy = perf.balls_bowled > 0 ? (perf.runs_conceded / perf.balls_bowled) * 6 : 12;
    const econScore = Math.max(0, Math.min((12 - economy) / 6, 1.0)) * 0.25;

    // Dot percentage (20%) — normalized against 50%
    const dotPct = perf.balls_bowled > 0
      ? (perf.dots_bowled / perf.balls_bowled) * 100
      : 0;
    const dotScore = Math.min(dotPct / 50, 1.0) * 0.20;

    // Bowling strike rate (15%) — lower is better, 12 = 1.0, 30+ = 0.0
    const bowlSR = perf.wickets > 0 ? perf.balls_bowled / perf.wickets : 30;
    const srScore = Math.max(0, Math.min((30 - bowlSR) / 18, 1.0)) * 0.15;

    // Impact (10%) — 3+ wickets
    const impactScore = (perf.wickets >= 3 ? 1.0 : perf.wickets >= 2 ? 0.6 : 0.2) * 0.10;

    const matchScore = wicketScore + econScore + dotScore + srScore + impactScore;
    weightedSum += matchScore * weight;
  });

  if (weightTotal === 0) return 0;
  return (weightedSum / weightTotal) * 10;
}

// ─── Trend Calculation ───

function computeTrend(performances: MatchPerformance[]): 'improving' | 'stable' | 'declining' {
  if (performances.length < 6) return 'stable';

  const recent = performances.slice(0, 3);
  const previous = performances.slice(3, 6);

  const recentAvg = recent.reduce((s, p) => s + p.runs, 0) / recent.length;
  const previousAvg = previous.reduce((s, p) => s + p.runs, 0) / previous.length;

  const diff = recentAvg - previousAvg;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

// ─── Main Entry Point ───

export async function computeFormScore(
  playerId: number,
  role: string = 'batter'
): Promise<FormScoreResult> {
  const performances = await getRecentPerformances(playerId);

  const battingScore = computeBattingScore(performances);
  const bowlingScore = computeBowlingScore(performances.filter(p => p.balls_bowled > 0));
  const trend = computeTrend(performances);

  // Role-weighted combination
  let overall: number;
  switch (role) {
    case 'bowler':
      overall = battingScore * 0.20 + bowlingScore * 0.80;
      break;
    case 'allrounder':
      overall = battingScore * 0.50 + bowlingScore * 0.50;
      break;
    case 'wicketkeeper':
    case 'batter':
    default:
      overall = battingScore * 0.85 + bowlingScore * 0.15;
      break;
  }

  overall = Math.round(Math.min(overall, 10) * 100) / 100;

  const leagues = [...new Set(performances.map(p => p.league_id))];
  const daysSince = performances.length > 0
    ? Math.floor((Date.now() - new Date(performances[0].date).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const confidence = computeFormConfidence(performances.length, leagues.length, daysSince);

  return {
    player_id: playerId,
    score: overall,
    trend,
    confidence,
    matches_used: performances.length,
    leagues,
    batting_sub: Math.round(battingScore * 100) / 100,
    bowling_sub: Math.round(bowlingScore * 100) / 100,
  };
}

// ─── Batch Computation ───

export async function computeAllFormScores(): Promise<{
  players_computed: number;
  errors: number;
}> {
  const db = getServiceClient();
  const { data: players } = await db.from('players').select('id, role');

  if (!players) return { players_computed: 0, errors: 0 };

  let computed = 0;
  let errors = 0;

  for (const player of players) {
    try {
      const p = player as Record<string, unknown>;
      const result = await computeFormScore(p.id as number, (p.role as string) || 'batter');

      // Upsert form scores
      for (const type of ['batting', 'bowling', 'overall'] as const) {
        const score = type === 'batting' ? result.batting_sub
          : type === 'bowling' ? result.bowling_sub
          : result.score;

        await db.from('form_scores').upsert({
          player_id: result.player_id,
          score_type: type,
          score,
          trend: result.trend,
          confidence: result.confidence.score,
          matches_used: result.matches_used,
          leagues_used: result.leagues.length,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'player_id,score_type' });
      }

      computed++;
    } catch (err) {
      console.error(`Form score error for player ${(player as Record<string, unknown>).id}:`, err);
      errors++;
    }
  }

  return { players_computed: computed, errors };
}
