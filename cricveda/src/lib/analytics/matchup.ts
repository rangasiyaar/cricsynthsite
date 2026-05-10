// ============================================================
// CricVeda — Batter vs Bowler Matchup Analyzer (F2.2)
// ============================================================

import { getServiceClient } from '@/lib/db/supabase';
import { computeMatchupConfidence } from '@/lib/analytics/confidence';
import type { MatchupResult, PhaseStats, KeyBattle } from '@/lib/types';

// ─── Compute H2H Matchup ───

export async function computeMatchup(
  batterId: number,
  bowlerId: number
): Promise<MatchupResult | null> {
  const db = getServiceClient();

  const { data: deliveries, error } = await db
    .from('deliveries')
    .select('*, matches!deliveries_match_id_fkey(league_id, date)')
    .eq('batter_id', batterId)
    .eq('bowler_id', bowlerId);

  if (error || !deliveries || deliveries.length === 0) return null;

  const balls = deliveries.length;
  const runs = deliveries.reduce((s: number, d: Record<string, unknown>) => s + (d.runs_batter as number), 0);
  const dismissals = deliveries.filter((d: Record<string, unknown>) => d.is_wicket === true).length;
  const dots = deliveries.filter((d: Record<string, unknown>) => (d.runs_total as number) === 0).length;
  const boundaries = deliveries.filter((d: Record<string, unknown>) => {
    const r = d.runs_batter as number;
    return r === 4 || r === 6;
  }).length;

  const strikeRate = balls > 0 ? Math.round((runs / balls) * 10000) / 100 : 0;
  const dotPct = balls > 0 ? Math.round((dots / balls) * 10000) / 100 : 0;
  const boundaryPct = balls > 0 ? Math.round((boundaries / balls) * 10000) / 100 : 0;
  const dismissalRate = balls > 0 ? (dismissals / balls) * 100 : 0;

  // Phase breakdown
  const phases: Record<string, { balls: number; runs: number; dismissals: number }> = {
    powerplay: { balls: 0, runs: 0, dismissals: 0 },
    middle: { balls: 0, runs: 0, dismissals: 0 },
    death: { balls: 0, runs: 0, dismissals: 0 },
  };

  for (const d of deliveries) {
    const del = d as Record<string, unknown>;
    const phase = del.phase as string;
    if (phases[phase]) {
      phases[phase].balls++;
      phases[phase].runs += del.runs_batter as number;
      if (del.is_wicket) phases[phase].dismissals++;
    }
  }

  const phaseBreakdown = {
    powerplay: toPhaseStats(phases.powerplay),
    middle: toPhaseStats(phases.middle),
    death: toPhaseStats(phases.death),
  };

  // Advantage determination
  let advantage: 'batter' | 'bowler' | 'even' = 'even';
  if (balls >= 6) {
    if ((strikeRate >= 140 && dismissalRate < 5) || (strikeRate >= 120 && dismissalRate < 3)) {
      advantage = 'batter';
    } else if ((strikeRate < 100 && dismissalRate > 4) || dismissalRate > 8) {
      advantage = 'bowler';
    }
  }

  // Fantasy note
  const fantasyNote = generateFantasyNote(advantage, strikeRate, dismissalRate, balls, dismissals);

  // Leagues
  const leagues = [...new Set(
    deliveries
      .map((d: Record<string, unknown>) => {
        const match = d.matches as Record<string, unknown> | undefined;
        return match?.league_id as string | undefined;
      })
      .filter(Boolean)
  )] as string[];

  // Days since last encounter
  const dates = deliveries
    .map((d: Record<string, unknown>) => {
      const match = d.matches as Record<string, unknown> | undefined;
      return match?.date as string | undefined;
    })
    .filter(Boolean)
    .sort()
    .reverse();

  const daysSince = dates.length > 0
    ? Math.floor((Date.now() - new Date(dates[0] as string).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const confidence = computeMatchupConfidence(balls, leagues.length, daysSince);

  return {
    batter_id: batterId,
    bowler_id: bowlerId,
    balls,
    runs,
    dismissals,
    strike_rate: strikeRate,
    dot_percentage: dotPct,
    boundary_percentage: boundaryPct,
    phase_breakdown: phaseBreakdown,
    advantage,
    fantasy_note: fantasyNote,
    confidence,
    leagues,
  };
}

function toPhaseStats(raw: { balls: number; runs: number; dismissals: number }): PhaseStats {
  return {
    balls: raw.balls,
    runs: raw.runs,
    strike_rate: raw.balls > 0 ? Math.round((raw.runs / raw.balls) * 10000) / 100 : 0,
    dismissals: raw.dismissals,
  };
}

function generateFantasyNote(
  advantage: string,
  sr: number,
  dismissalRate: number,
  balls: number,
  dismissals: number
): string {
  if (balls < 6) return `Only ${balls} balls bowled — too small a sample for reliable insight.`;

  if (advantage === 'batter') {
    return `The batter dominates this matchup with a ${sr.toFixed(1)} SR across ${balls} balls. Consider picking the batter as a fantasy captain if this matchup features heavily.`;
  }
  if (advantage === 'bowler') {
    return `The bowler has the edge with ${dismissals} dismissal${dismissals > 1 ? 's' : ''} in ${balls} balls (${dismissalRate.toFixed(1)}% dismissal rate). This matchup could limit the batter's fantasy ceiling.`;
  }
  return `An evenly contested matchup across ${balls} balls. Neither player has a clear statistical edge — look at venue and form for tie-breaking.`;
}

// ─── Key Battles for a Fixture ───

export async function getKeyBattles(fixtureId: number): Promise<KeyBattle[]> {
  const db = getServiceClient();

  // Get playing XI
  const { data: xi } = await db
    .from('playing_xi')
    .select('player_id, team_id, players!playing_xi_player_id_fkey(name, role)')
    .eq('fixture_id', fixtureId);

  if (!xi || xi.length < 2) return [];

  const teams = [...new Set(xi.map((p: Record<string, unknown>) => p.team_id as number))];
  if (teams.length < 2) return [];

  const team1Players = xi.filter((p: Record<string, unknown>) => p.team_id === teams[0]);
  const team2Players = xi.filter((p: Record<string, unknown>) => p.team_id === teams[1]);

  const batters = [...team1Players, ...team2Players].filter((p: Record<string, unknown>) => {
    const player = p.players as Record<string, unknown> | undefined;
    const role = player?.role as string;
    return role === 'batter' || role === 'wicketkeeper' || role === 'allrounder';
  });

  const bowlers = [...team1Players, ...team2Players].filter((p: Record<string, unknown>) => {
    const player = p.players as Record<string, unknown> | undefined;
    const role = player?.role as string;
    return role === 'bowler' || role === 'allrounder';
  });

  const battles: KeyBattle[] = [];

  for (const batter of batters) {
    for (const bowler of bowlers) {
      const b = batter as Record<string, unknown>;
      const bo = bowler as Record<string, unknown>;
      if (b.team_id === bo.team_id) continue;

      const matchup = await computeMatchup(b.player_id as number, bo.player_id as number);
      if (matchup && matchup.balls >= 6) {
        const batterPlayer = b.players as Record<string, unknown>;
        const bowlerPlayer = bo.players as Record<string, unknown>;
        battles.push({
          batter_id: b.player_id as number,
          batter_name: (batterPlayer?.name as string) || 'Unknown',
          bowler_id: bo.player_id as number,
          bowler_name: (bowlerPlayer?.name as string) || 'Unknown',
          balls: matchup.balls,
          strike_rate: matchup.strike_rate,
          dismissals: matchup.dismissals,
          advantage: matchup.advantage,
          fantasy_impact: matchup.fantasy_note,
        });
      }
    }
  }

  // Sort by most balls (most data = most interesting)
  battles.sort((a, b) => b.balls - a.balls);
  return battles.slice(0, 5);
}
