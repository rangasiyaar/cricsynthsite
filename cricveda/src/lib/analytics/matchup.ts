// ============================================================
// CricVeda — Batter vs Bowler Matchup Analyzer (F2.2)
// ============================================================

import { getSupabaseClient } from '@/lib/db/supabase';
import { MatchupResult, PhaseStats } from '@/lib/types';
import { computeMatchupConfidence } from '@/lib/analytics/confidence';

// Minimum balls for statistical relevance
const MIN_BALLS_THRESHOLD = 6;

// ─── MAIN MATCHUP FUNCTION ───

export async function getMatchup(
  batterId: number,
  bowlerId: number
): Promise<MatchupResult | null> {
  const db = getSupabaseClient();

  // Get player names
  const [{ data: batter }, { data: bowler }] = await Promise.all([
    db.from('players').select('name').eq('id', batterId).single(),
    db.from('players').select('name').eq('id', bowlerId).single(),
  ]);

  if (!batter || !bowler) return null;

  // Get all deliveries between this batter and bowler
  const { data: deliveries } = await db
    .from('deliveries')
    .select(`
      runs_batter, runs_total, is_wicket, wicket_kind,
      is_boundary, is_six, is_dot, phase,
      match_id, over_number
    `)
    .eq('batter_id', batterId)
    .eq('bowler_id', bowlerId);

  if (!deliveries || deliveries.length === 0) return null;

  // Get league info for these matches
  const matchIds = [...new Set(deliveries.map((d: Record<string, unknown>) => d.match_id as number))];
  const { data: matches } = await db
    .from('matches')
    .select('id, league_id, date')
    .in('id', matchIds);

  const matchLeagueMap = new Map<number, string>();
  const matchDateMap = new Map<number, string>();
  matches?.forEach((m: Record<string, unknown>) => {
    matchLeagueMap.set(m.id as number, m.league_id as string);
    matchDateMap.set(m.id as number, m.date as string);
  });

  // Aggregate stats
  const totalBalls = deliveries.length;
  const totalRuns = deliveries.reduce((s: number, d: Record<string, unknown>) => s + (d.runs_batter as number), 0);
  const totalDismissals = deliveries.filter((d: Record<string, unknown>) => d.is_wicket).length;
  const totalDots = deliveries.filter((d: Record<string, unknown>) => d.is_dot).length;
  const totalBoundaries = deliveries.filter((d: Record<string, unknown>) => d.is_boundary || d.is_six).length;

  const strikeRate = totalBalls > 0 ? (totalRuns / totalBalls) * 100 : 0;
  const dotPct = totalBalls > 0 ? (totalDots / totalBalls) * 100 : 0;
  const boundaryPct = totalBalls > 0 ? (totalBoundaries / totalBalls) * 100 : 0;

  // Phase breakdown
  const phases = {
    powerplay: computePhaseStats(deliveries, 'powerplay'),
    middle: computePhaseStats(deliveries, 'middle'),
    death: computePhaseStats(deliveries, 'death'),
  };

  // Determine advantage
  const advantage = determineAdvantage(strikeRate, totalDismissals, totalBalls);

  // Fantasy note
  const fantasyNote = generateFantasyNote(
    batter.name,
    bowler.name,
    strikeRate,
    totalDismissals,
    totalBalls,
    advantage
  );

  // Leagues used
  const leagues = [...new Set(matchIds.map(id => matchLeagueMap.get(id)).filter(Boolean))] as string[];

  // Most recent date
  const dates = matchIds.map(id => matchDateMap.get(id)).filter(Boolean) as string[];
  const mostRecent = dates.sort().pop();

  // Confidence
  const confidence = computeMatchupConfidence(totalBalls, leagues.length, mostRecent);

  return {
    batter_id: batterId,
    batter_name: batter.name,
    bowler_id: bowlerId,
    bowler_name: bowler.name,
    balls: totalBalls,
    runs: totalRuns,
    dismissals: totalDismissals,
    strike_rate: Math.round(strikeRate * 100) / 100,
    dot_pct: Math.round(dotPct * 100) / 100,
    boundary_pct: Math.round(boundaryPct * 100) / 100,
    advantage,
    confidence: confidence.value,
    fantasy_note: fantasyNote,
    phases,
    leagues,
  };
}

// ─── PHASE STATS ───

function computePhaseStats(
  deliveries: Record<string, unknown>[],
  phase: string
): PhaseStats {
  const phaseDeliveries = deliveries.filter(d => d.phase === phase);
  const balls = phaseDeliveries.length;
  const runs = phaseDeliveries.reduce((s, d) => s + (d.runs_batter as number), 0);
  const dismissals = phaseDeliveries.filter(d => d.is_wicket).length;
  const dots = phaseDeliveries.filter(d => d.is_dot).length;

  return {
    balls,
    runs,
    dismissals,
    strike_rate: balls > 0 ? Math.round(((runs / balls) * 100) * 100) / 100 : 0,
    dot_pct: balls > 0 ? Math.round(((dots / balls) * 100) * 100) / 100 : 0,
  };
}

// ─── ADVANTAGE DETERMINATION ───

function determineAdvantage(
  strikeRate: number,
  dismissals: number,
  balls: number
): 'batter' | 'bowler' | 'even' {
  if (balls < MIN_BALLS_THRESHOLD) return 'even'; // Insufficient data

  const dismissalRate = balls > 0 ? dismissals / balls : 0;

  // Batter advantage: high SR + low dismissal rate
  if (strikeRate >= 140 && dismissalRate < 0.05) return 'batter';
  // Strong batter: decent SR + very low dismissal rate
  if (strikeRate >= 120 && dismissalRate < 0.03) return 'batter';

  // Bowler advantage: low SR or high dismissal rate
  if (strikeRate < 100 && dismissalRate > 0.04) return 'bowler';
  if (dismissalRate > 0.08) return 'bowler';

  return 'even';
}

// ─── FANTASY NOTE GENERATOR ───

function generateFantasyNote(
  batterName: string,
  bowlerName: string,
  strikeRate: number,
  dismissals: number,
  balls: number,
  advantage: string
): string {
  const sr = Math.round(strikeRate);

  if (balls < MIN_BALLS_THRESHOLD) {
    return `Limited data (${balls} balls) — insufficient for reliable analysis`;
  }

  if (advantage === 'bowler') {
    const parts = [`${bowlerName} dominates ${batterName}`];
    if (dismissals > 0) parts.push(`${dismissals} dismissal${dismissals > 1 ? 's' : ''} in ${balls} balls`);
    parts.push(`SR ${sr}`);
    return parts.join(' — ');
  }

  if (advantage === 'batter') {
    return `${batterName} has the edge vs ${bowlerName} — SR ${sr} across ${balls} balls, ${dismissals} dismissal${dismissals !== 1 ? 's' : ''}`;
  }

  return `Even contest: ${batterName} vs ${bowlerName} — SR ${sr}, ${dismissals} dismissal${dismissals !== 1 ? 's' : ''} in ${balls} balls`;
}

// ─── KEY BATTLES FOR A MATCH ───

export async function getKeyBattles(
  fixtureId: number,
  limit: number = 5
): Promise<MatchupResult[]> {
  const db = getSupabaseClient();

  // Get playing XI for both teams
  const { data: playingXI } = await db
    .from('playing_xi')
    .select('player_id, team_id')
    .eq('fixture_id', fixtureId);

  if (!playingXI || playingXI.length === 0) return [];

  // Get fixture teams
  const { data: fixture } = await db
    .from('fixtures')
    .select('team1_id, team2_id')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return [];

  const team1Players = playingXI
    .filter((p: Record<string, unknown>) => p.team_id === fixture.team1_id)
    .map((p: Record<string, unknown>) => p.player_id as number);
  const team2Players = playingXI
    .filter((p: Record<string, unknown>) => p.team_id === fixture.team2_id)
    .map((p: Record<string, unknown>) => p.player_id as number);

  // Get player roles
  const allPlayerIds = [...team1Players, ...team2Players];
  const { data: players } = await db
    .from('players')
    .select('id, role')
    .in('id', allPlayerIds);

  const roleMap = new Map<number, string>();
  players?.forEach((p: Record<string, unknown>) => roleMap.set(p.id as number, p.role as string));

  // Find batter vs bowler matchups across teams
  const matchups: MatchupResult[] = [];

  // Team 1 batters vs Team 2 bowlers
  for (const batterId of team1Players) {
    const role = roleMap.get(batterId);
    if (role === 'bowler') continue; // Skip pure bowlers as batters

    for (const bowlerId of team2Players) {
      const bowlerRole = roleMap.get(bowlerId);
      if (bowlerRole === 'batter' || bowlerRole === 'wicketkeeper') continue;

      const matchup = await getMatchup(batterId, bowlerId);
      if (matchup && matchup.balls >= MIN_BALLS_THRESHOLD) {
        matchups.push(matchup);
      }
    }
  }

  // Team 2 batters vs Team 1 bowlers
  for (const batterId of team2Players) {
    const role = roleMap.get(batterId);
    if (role === 'bowler') continue;

    for (const bowlerId of team1Players) {
      const bowlerRole = roleMap.get(bowlerId);
      if (bowlerRole === 'batter' || bowlerRole === 'wicketkeeper') continue;

      const matchup = await getMatchup(batterId, bowlerId);
      if (matchup && matchup.balls >= MIN_BALLS_THRESHOLD) {
        matchups.push(matchup);
      }
    }
  }

  // Sort by significance (most balls + strongest advantage)
  matchups.sort((a, b) => {
    const scoreA = a.balls * (a.advantage !== 'even' ? 1.5 : 1);
    const scoreB = b.balls * (b.advantage !== 'even' ? 1.5 : 1);
    return scoreB - scoreA;
  });

  return matchups.slice(0, limit);
}
