// ============================================================
// CricVeda — Fantasy Engine (F2.5, F2.6, F2.7)
// Dream Team Generator, Captain Picker, Differential Finder
// ============================================================

import { getServiceClient } from '@/lib/db/supabase';
import { computeFormScore } from '@/lib/analytics/form-score';
import { computeMatchup } from '@/lib/analytics/matchup';
import { getVenueIntelligence } from '@/lib/analytics/venue';
import { computeDreamTeamConfidence } from '@/lib/analytics/confidence';
import type {
  DreamTeamResult,
  DreamTeamPlayer,
  CaptainPick,
  Differential,
  KeyBattle,
  DEFAULT_FANTASY_CONFIG,
} from '@/lib/types';
import { DEFAULT_FANTASY_CONFIG as FANTASY_CONFIG } from '@/lib/types';

// ─── Dream11 Constraints ───

const CONSTRAINTS = {
  total: 11,
  wk: { min: 1, max: 4 },
  bat: { min: 3, max: 6 },
  ar: { min: 1, max: 4 },
  bowl: { min: 3, max: 6 },
  maxPerTeam: 7,
  minPerTeam: 1,
};

type RoleKey = 'wk' | 'bat' | 'ar' | 'bowl';

function roleToKey(role: string): RoleKey {
  switch (role) {
    case 'wicketkeeper': return 'wk';
    case 'batter': return 'bat';
    case 'allrounder': return 'ar';
    case 'bowler': return 'bowl';
    default: return 'bat';
  }
}

// ─── Dream Team Generator ───

export async function generateDreamTeam(fixtureId: number): Promise<DreamTeamResult | null> {
  const db = getServiceClient();

  // Get fixture info
  const { data: fixture } = await db
    .from('fixtures')
    .select('*, teams_team1:teams!fixtures_team1_id_fkey(short_name), teams_team2:teams!fixtures_team2_id_fkey(short_name)')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return null;

  // Get playing XI
  const { data: xi } = await db
    .from('playing_xi')
    .select('player_id, team_id, players!playing_xi_player_id_fkey(name, role)')
    .eq('fixture_id', fixtureId);

  if (!xi || xi.length < 11) return null;

  // Compute expected points for each player
  const candidates: (DreamTeamPlayer & { team_id: number })[] = [];

  for (const entry of xi) {
    const e = entry as Record<string, unknown>;
    const player = e.players as Record<string, unknown>;
    const playerId = e.player_id as number;
    const teamId = e.team_id as number;
    const role = (player?.role as string) || 'batter';
    const name = (player?.name as string) || 'Unknown';

    const formResult = await computeFormScore(playerId, role);
    const basePoints = FANTASY_CONFIG.base_points[role as keyof typeof FANTASY_CONFIG.base_points] || 28;
    const expectedPoints = Math.round((basePoints * (0.5 + formResult.score / 10) + FANTASY_CONFIG.playing_xi_bonus) * 10) / 10;

    const fixtureData = fixture as Record<string, unknown>;
    const team1 = fixtureData.teams_team1 as Record<string, unknown> | undefined;
    const team2 = fixtureData.teams_team2 as Record<string, unknown> | undefined;
    const teamName = teamId === (fixtureData.team1_id as number)
      ? (team1?.short_name as string) || 'T1'
      : (team2?.short_name as string) || 'T2';

    candidates.push({
      player_id: playerId,
      player_name: name,
      team: teamName,
      role,
      expected_points: expectedPoints,
      form_score: formResult.score,
      is_captain: false,
      is_vice_captain: false,
      team_id: teamId,
    });
  }

  // Sort by expected points descending
  candidates.sort((a, b) => b.expected_points - a.expected_points);

  // Two-pass selection respecting constraints
  const selected: (DreamTeamPlayer & { team_id: number })[] = [];
  const roleCounts: Record<RoleKey, number> = { wk: 0, bat: 0, ar: 0, bowl: 0 };
  const teamCounts: Record<number, number> = {};
  const used = new Set<number>();

  // Pass 1: Fill minimums
  for (const roleKey of ['wk', 'bat', 'ar', 'bowl'] as RoleKey[]) {
    const min = CONSTRAINTS[roleKey].min;
    const roleCandidates = candidates.filter(c => roleToKey(c.role) === roleKey && !used.has(c.player_id));

    for (const c of roleCandidates) {
      if (roleCounts[roleKey] >= min) break;
      if ((teamCounts[c.team_id] || 0) >= CONSTRAINTS.maxPerTeam) continue;

      selected.push(c);
      used.add(c.player_id);
      roleCounts[roleKey]++;
      teamCounts[c.team_id] = (teamCounts[c.team_id] || 0) + 1;
    }
  }

  // Pass 2: Fill remaining slots by highest expected points
  const remaining = candidates.filter(c => !used.has(c.player_id));
  for (const c of remaining) {
    if (selected.length >= CONSTRAINTS.total) break;

    const rk = roleToKey(c.role);
    if (roleCounts[rk] >= CONSTRAINTS[rk].max) continue;
    if ((teamCounts[c.team_id] || 0) >= CONSTRAINTS.maxPerTeam) continue;

    selected.push(c);
    used.add(c.player_id);
    roleCounts[rk]++;
    teamCounts[c.team_id] = (teamCounts[c.team_id] || 0) + 1;
  }

  // Assign captain and vice-captain (top 2 by expected points)
  selected.sort((a, b) => b.expected_points - a.expected_points);
  if (selected.length > 0) selected[0].is_captain = true;
  if (selected.length > 1) selected[1].is_vice_captain = true;

  // Confidence
  const avgConfidence = candidates.length > 0
    ? candidates.reduce((s, c) => s + (c.form_score / 10), 0) / candidates.length
    : 0;
  const confidence = computeDreamTeamConfidence(avgConfidence, selected.length, CONSTRAINTS.total);

  return {
    players: selected.map(({ team_id, ...rest }) => rest),
    team_composition: { ...roleCounts },
    total_expected_points: Math.round(selected.reduce((s, p) => s + p.expected_points, 0) * 10) / 10,
    confidence,
  };
}

// ─── Captain Picker ───

export async function getCaptainPicks(fixtureId: number): Promise<CaptainPick[]> {
  const db = getServiceClient();

  const { data: fixture } = await db
    .from('fixtures')
    .select('venue_id, team1_id, team2_id')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return [];

  const fixtureData = fixture as Record<string, unknown>;

  const { data: xi } = await db
    .from('playing_xi')
    .select('player_id, team_id, players!playing_xi_player_id_fkey(name, role)')
    .eq('fixture_id', fixtureId);

  if (!xi) return [];

  const venueIntel = await getVenueIntelligence(fixtureData.venue_id as number);

  const picks: CaptainPick[] = [];

  for (const entry of xi) {
    const e = entry as Record<string, unknown>;
    const player = e.players as Record<string, unknown>;
    const playerId = e.player_id as number;
    const role = (player?.role as string) || 'batter';
    const name = (player?.name as string) || 'Unknown';

    const formResult = await computeFormScore(playerId, role);

    // Weighted captain score
    const formWeight = formResult.score * 0.35;
    const venueWeight = (venueIntel ? 5 : 3) * 0.25; // Simplified venue scoring
    const matchupWeight = 5 * 0.20; // Placeholder for matchup scoring
    const consistencyWeight = (formResult.trend === 'improving' ? 7 : formResult.trend === 'stable' ? 5 : 3) * 0.10;
    const roleCeiling = (role === 'allrounder' ? 8 : role === 'wicketkeeper' ? 7 : 6) * 0.10;

    const captainScore = Math.round((formWeight + venueWeight + matchupWeight + consistencyWeight + roleCeiling) * 100) / 100;

    // Risk level
    let riskLevel: 'safe' | 'moderate' | 'risky' = 'moderate';
    if (formResult.score >= 7 && formResult.trend !== 'declining') riskLevel = 'safe';
    else if (formResult.score < 5 || formResult.trend === 'declining') riskLevel = 'risky';

    // Reasoning
    const reasoning: string[] = [];
    reasoning.push(`${formResult.score.toFixed(1)} form score (${formResult.trend})`);
    if (formResult.matches_used >= 10) reasoning.push(`Based on ${formResult.matches_used} recent matches`);
    if (formResult.leagues.length > 1) reasoning.push(`Cross-league form across ${formResult.leagues.length} leagues`);

    picks.push({
      player_id: playerId,
      player_name: name,
      team: '',
      role,
      captain_score: captainScore,
      risk_level: riskLevel,
      reasoning,
      confidence: formResult.confidence,
    });
  }

  // Sort by captain score descending, return top 3
  picks.sort((a, b) => b.captain_score - a.captain_score);
  return picks.slice(0, 3);
}

// ─── Differential Finder ───

export async function getDifferentials(fixtureId: number): Promise<Differential[]> {
  const db = getServiceClient();

  const { data: xi } = await db
    .from('playing_xi')
    .select('player_id, team_id, players!playing_xi_player_id_fkey(name, role)')
    .eq('fixture_id', fixtureId);

  if (!xi) return [];

  const differentials: Differential[] = [];

  for (const entry of xi) {
    const e = entry as Record<string, unknown>;
    const player = e.players as Record<string, unknown>;
    const playerId = e.player_id as number;
    const role = (player?.role as string) || 'batter';
    const name = (player?.name as string) || 'Unknown';

    const formResult = await computeFormScore(playerId, role);

    // Differentials: form between 4.0 and 7.5
    if (formResult.score >= 4.0 && formResult.score <= 7.5) {
      const basePoints = FANTASY_CONFIG.base_points[role as keyof typeof FANTASY_CONFIG.base_points] || 28;
      const expectedPoints = Math.round((basePoints * (0.5 + formResult.score / 10) + FANTASY_CONFIG.playing_xi_bonus) * 10) / 10;

      let reason = 'Decent form but likely low ownership';
      if (formResult.trend === 'improving') reason = 'Form trending up — under-the-radar pick';
      else if (formResult.leagues.length > 2) reason = 'Strong cross-league record, often overlooked';

      differentials.push({
        player_id: playerId,
        player_name: name,
        team: '',
        role,
        form_score: formResult.score,
        expected_points: expectedPoints,
        reason,
      });
    }
  }

  differentials.sort((a, b) => b.expected_points - a.expected_points);
  return differentials;
}
