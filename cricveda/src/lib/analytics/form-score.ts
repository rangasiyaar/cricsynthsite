// ============================================================
// CricVeda — Cross-League Form Score Calculator (F2.1)
// ============================================================
// Form score synthesizes a player's recent T20 performance
// across ALL leagues into a single 0-10 score.

import { getSupabaseClient } from '@/lib/db/supabase';
import { FormScore, ConfidenceScore } from '@/lib/types';
import { computeConfidence } from '@/lib/analytics/confidence';

// ─── CONFIGURATION ───

const FORM_CONFIG = {
  // How many recent matches to consider
  maxMatches: 20,
  // Exponential decay — more recent matches weigh more
  decayFactor: 0.92,
  // Minimum matches for a meaningful score
  minMatchesForScore: 3,
  // Batting score weights
  batting: {
    runsWeight: 0.30,
    strikeRateWeight: 0.25,
    boundaryPctWeight: 0.15,
    consistencyWeight: 0.20,
    impactWeight: 0.10,
  },
  // Bowling score weights
  bowling: {
    wicketsWeight: 0.30,
    economyWeight: 0.25,
    dotPctWeight: 0.20,
    strikeRateWeight: 0.15,
    impactWeight: 0.10,
  },
};

// ─── TYPES ───

interface MatchPerformance {
  match_id: number;
  date: string;
  league_id: string;
  runs_scored: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  is_not_out: boolean;
  wickets_taken: number;
  overs_bowled: number;
  runs_conceded: number;
  dots_bowled: number;
  balls_bowled: number;
}

// ─── MAIN CALCULATOR ───

export async function calculateFormScore(
  playerId: number,
  scoreType: 'batting' | 'bowling' | 'overall' = 'overall'
): Promise<FormScore | null> {
  const db = getSupabaseClient();

  // Get player info
  const { data: player } = await db
    .from('players')
    .select('id, name, role')
    .eq('id', playerId)
    .single();

  if (!player) return null;

  // Fetch recent match performances
  const performances = await getRecentPerformances(playerId);

  if (performances.length < FORM_CONFIG.minMatchesForScore) {
    return {
      player_id: playerId,
      player_name: player.name,
      score_type: scoreType,
      score: 0,
      trend: 'stable',
      confidence: performances.length > 0 ? 0.3 : 0.1,
      matches_used: performances.length,
      leagues_used: [...new Set(performances.map(p => p.league_id))],
      data_sources: ['cricsheet'],
      computed_at: new Date().toISOString(),
    };
  }

  let score = 0;
  const leaguesUsed = [...new Set(performances.map(p => p.league_id))];

  if (scoreType === 'batting' || scoreType === 'overall') {
    const battingScore = calculateBattingForm(performances);
    score = scoreType === 'batting' ? battingScore : score + battingScore * 0.5;
  }

  if (scoreType === 'bowling' || scoreType === 'overall') {
    const bowlingScore = calculateBowlingForm(performances);
    score = scoreType === 'bowling' ? bowlingScore : score + bowlingScore * 0.5;
  }

  // For overall, adjust based on role
  if (scoreType === 'overall') {
    if (player.role === 'batter' || player.role === 'wicketkeeper') {
      const bat = calculateBattingForm(performances);
      const bowl = calculateBowlingForm(performances);
      score = bat * 0.85 + bowl * 0.15;
    } else if (player.role === 'bowler') {
      const bat = calculateBattingForm(performances);
      const bowl = calculateBowlingForm(performances);
      score = bat * 0.2 + bowl * 0.8;
    }
    // allrounder stays at 50/50
  }

  // Clamp to 0-10
  score = Math.max(0, Math.min(10, score));

  // Calculate trend
  const trend = calculateTrend(performances);

  // Confidence
  const confidence = computeConfidence(
    performances.length,
    leaguesUsed.length,
    performances[0]?.date
  );

  return {
    player_id: playerId,
    player_name: player.name,
    score_type: scoreType,
    score: Math.round(score * 100) / 100,
    trend,
    confidence: confidence.value,
    matches_used: performances.length,
    leagues_used: leaguesUsed,
    data_sources: ['cricsheet'],
    computed_at: new Date().toISOString(),
  };
}

// ─── BATTING FORM ───

function calculateBattingForm(performances: MatchPerformance[]): number {
  if (performances.length === 0) return 0;

  const w = FORM_CONFIG.batting;
  let totalWeight = 0;
  let weightedScore = 0;

  performances.forEach((p, index) => {
    if (p.balls_faced === 0) return;

    const decay = Math.pow(FORM_CONFIG.decayFactor, index);
    totalWeight += decay;

    // Runs component (normalized: 50+ is excellent, 0 is poor)
    const runsNorm = Math.min(p.runs_scored / 60, 1.0);

    // Strike rate component (normalized: 150+ is excellent, <100 is poor)
    const sr = (p.runs_scored / p.balls_faced) * 100;
    const srNorm = Math.max(0, Math.min((sr - 80) / 100, 1.0));

    // Boundary percentage
    const boundaryBalls = p.fours + p.sixes;
    const boundaryPct = p.balls_faced > 0 ? boundaryBalls / p.balls_faced : 0;
    const boundaryNorm = Math.min(boundaryPct / 0.3, 1.0);

    // Impact (did they score a big knock?)
    const impactNorm = p.runs_scored >= 50 ? 1.0 : p.runs_scored >= 30 ? 0.7 : p.runs_scored >= 15 ? 0.4 : 0.1;

    const matchScore =
      runsNorm * w.runsWeight +
      srNorm * w.strikeRateWeight +
      boundaryNorm * w.boundaryPctWeight +
      impactNorm * w.impactWeight;

    weightedScore += matchScore * decay;
  });

  if (totalWeight === 0) return 0;

  // Consistency bonus: low variance in scores
  const scores = performances
    .filter(p => p.balls_faced > 0)
    .map(p => p.runs_scored);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
  const consistencyNorm = Math.max(0, 1 - cv * 0.5);

  const baseScore = (weightedScore / totalWeight) * 10;
  return baseScore * (1 - w.consistencyWeight) + consistencyNorm * 10 * w.consistencyWeight;
}

// ─── BOWLING FORM ───

function calculateBowlingForm(performances: MatchPerformance[]): number {
  if (performances.length === 0) return 0;

  const w = FORM_CONFIG.bowling;
  let totalWeight = 0;
  let weightedScore = 0;

  performances.forEach((p, index) => {
    if (p.balls_bowled === 0) return;

    const decay = Math.pow(FORM_CONFIG.decayFactor, index);
    totalWeight += decay;

    const oversFloat = p.balls_bowled / 6;

    // Wickets component
    const wicketsNorm = Math.min(p.wickets_taken / 4, 1.0);

    // Economy component (lower is better: <=6 excellent, >12 poor)
    const economy = oversFloat > 0 ? p.runs_conceded / oversFloat : 12;
    const economyNorm = Math.max(0, Math.min((12 - economy) / 8, 1.0));

    // Dot ball percentage
    const dotPct = p.balls_bowled > 0 ? p.dots_bowled / p.balls_bowled : 0;
    const dotNorm = Math.min(dotPct / 0.5, 1.0);

    // Bowling strike rate (balls per wicket — lower is better)
    const bsr = p.wickets_taken > 0 ? p.balls_bowled / p.wickets_taken : 30;
    const bsrNorm = Math.max(0, Math.min((30 - bsr) / 24, 1.0));

    // Impact
    const impactNorm = p.wickets_taken >= 3 ? 1.0 : p.wickets_taken >= 2 ? 0.7 : p.wickets_taken >= 1 ? 0.4 : 0.1;

    const matchScore =
      wicketsNorm * w.wicketsWeight +
      economyNorm * w.economyWeight +
      dotNorm * w.dotPctWeight +
      bsrNorm * w.strikeRateWeight +
      impactNorm * w.impactWeight;

    weightedScore += matchScore * decay;
  });

  if (totalWeight === 0) return 0;

  return (weightedScore / totalWeight) * 10;
}

// ─── TREND CALCULATION ───

function calculateTrend(
  performances: MatchPerformance[]
): 'improving' | 'declining' | 'stable' {
  if (performances.length < 6) return 'stable';

  const recent = performances.slice(0, 3);
  const older = performances.slice(3, 6);

  const recentAvg = recent.reduce((s, p) => s + p.runs_scored, 0) / recent.length;
  const olderAvg = older.reduce((s, p) => s + p.runs_scored, 0) / older.length;

  const diff = recentAvg - olderAvg;
  const threshold = olderAvg * 0.15;

  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'declining';
  return 'stable';
}

// ─── DATA FETCHING ───

async function getRecentPerformances(
  playerId: number
): Promise<MatchPerformance[]> {
  const db = getSupabaseClient();

  // Get recent match IDs for this player, across all leagues
  const { data: matchIds } = await db
    .from('deliveries')
    .select('match_id')
    .or(`batter_id.eq.${playerId},bowler_id.eq.${playerId}`)
    .order('match_id', { ascending: false });

  if (!matchIds || matchIds.length === 0) return [];

  // Unique match IDs
  const uniqueMatchIds = [
    ...new Set(matchIds.map((m: { match_id: number }) => m.match_id)),
  ].slice(0, FORM_CONFIG.maxMatches);

  // Get match info for dates and league
  const { data: matches } = await db
    .from('matches')
    .select('id, date, league_id')
    .in('id', uniqueMatchIds)
    .order('date', { ascending: false });

  if (!matches) return [];

  // For each match, aggregate batting and bowling stats
  const performances: MatchPerformance[] = [];

  for (const match of matches) {
    // Batting stats
    const { data: batting } = await db
      .from('deliveries')
      .select('runs_batter, is_boundary, is_six, is_wicket, wicket_player_id')
      .eq('match_id', match.id)
      .eq('batter_id', playerId);

    // Bowling stats
    const { data: bowling } = await db
      .from('deliveries')
      .select('runs_total, is_wicket, is_dot, extra_type')
      .eq('match_id', match.id)
      .eq('bowler_id', playerId);

    const battingData = batting || [];
    const bowlingData = bowling || [];

    const isNotOut = !battingData.some(
      (d: Record<string, unknown>) => d.is_wicket && d.wicket_player_id === playerId
    );

    performances.push({
      match_id: match.id,
      date: match.date,
      league_id: match.league_id,
      runs_scored: battingData.reduce((s: number, d: Record<string, unknown>) => s + (d.runs_batter as number), 0),
      balls_faced: battingData.length,
      fours: battingData.filter((d: Record<string, unknown>) => d.is_boundary && !d.is_six).length,
      sixes: battingData.filter((d: Record<string, unknown>) => d.is_six).length,
      is_not_out: isNotOut,
      wickets_taken: bowlingData.filter((d: Record<string, unknown>) => d.is_wicket).length,
      overs_bowled: bowlingData.length / 6,
      runs_conceded: bowlingData.reduce((s: number, d: Record<string, unknown>) => s + (d.runs_total as number), 0),
      dots_bowled: bowlingData.filter((d: Record<string, unknown>) => d.is_dot).length,
      balls_bowled: bowlingData.filter((d: Record<string, unknown>) => !d.extra_type || d.extra_type === 'bye' || d.extra_type === 'legbye').length,
    });
  }

  return performances;
}

// ─── BATCH COMPUTATION ───

export async function computeAllFormScores(): Promise<number> {
  const db = getSupabaseClient();

  // Get all players with T20 data
  const { data: players } = await db
    .from('players')
    .select('id')
    .gt('t20_matches', 0);

  if (!players) return 0;

  let computed = 0;

  for (const player of players) {
    const scores = await Promise.all([
      calculateFormScore(player.id, 'batting'),
      calculateFormScore(player.id, 'bowling'),
      calculateFormScore(player.id, 'overall'),
    ]);

    for (const score of scores) {
      if (score && score.score > 0) {
        await db.from('form_scores').upsert(
          {
            player_id: score.player_id,
            score_type: score.score_type,
            score: score.score,
            trend: score.trend,
            confidence: score.confidence,
            matches_used: score.matches_used,
            leagues_used: score.leagues_used,
            data_sources: score.data_sources,
            computed_at: score.computed_at,
          },
          { onConflict: 'player_id,score_type' }
        );
        computed++;
      }
    }
  }

  console.log(`[FormScore] Computed ${computed} form scores for ${players.length} players`);
  return computed;
}
