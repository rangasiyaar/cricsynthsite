// ============================================================
// CricVeda — Fantasy Intelligence (F2.5, F2.6, F2.7, F2.8)
// Dream Team Generator, Captain Picker, Differentials
// ============================================================

import { getSupabaseClient } from '@/lib/db/supabase';
import {
  DreamTeam,
  DreamTeamPick,
  CaptainPick,
  FantasyPointsConfig,
  DREAM11_T20_SCORING,
} from '@/lib/types';
import { computeDreamTeamConfidence } from '@/lib/analytics/confidence';

// ─── DREAM TEAM CONSTRAINTS ───

const DREAM_TEAM_CONSTRAINTS = {
  total: 11,
  wicketkeeper: { min: 1, max: 4 },
  batter: { min: 3, max: 6 },
  allrounder: { min: 1, max: 4 },
  bowler: { min: 3, max: 6 },
  maxFromOneTeam: 7,
  minFromEachTeam: 1,
};

// ─── TYPES ───

interface PlayerCandidate {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  role: string;
  expected_points: number;
  form_score: number;
  reasoning: string[];
  confidence: number;
}

// ─── DREAM TEAM GENERATOR ───

export async function generateDreamTeam(
  fixtureId: number,
  config: FantasyPointsConfig = DREAM11_T20_SCORING
): Promise<DreamTeam | null> {
  const db = getSupabaseClient();

  // Get fixture details
  const { data: fixture } = await db
    .from('fixtures')
    .select('id, team1_id, team2_id, venue_id')
    .eq('id', fixtureId)
    .single();

  if (!fixture) return null;

  // Get playing XI for both teams
  const { data: playingXI } = await db
    .from('playing_xi')
    .select('player_id, team_id')
    .eq('fixture_id', fixtureId);

  if (!playingXI || playingXI.length < 11) return null;

  // Get team names
  const { data: teams } = await db
    .from('teams')
    .select('id, name, short_name')
    .in('id', [fixture.team1_id, fixture.team2_id]);

  const teamMap = new Map<number, string>();
  teams?.forEach((t: Record<string, unknown>) =>
    teamMap.set(t.id as number, (t.short_name || t.name) as string)
  );

  // Get player details + form scores
  const playerIds = playingXI.map((p: Record<string, unknown>) => p.player_id as number);
  const { data: players } = await db
    .from('players')
    .select('id, name, role')
    .in('id', playerIds);

  const { data: formScores } = await db
    .from('form_scores')
    .select('player_id, score, confidence')
    .in('player_id', playerIds)
    .eq('score_type', 'overall');

  const formMap = new Map<number, { score: number; confidence: number }>();
  formScores?.forEach((f: Record<string, unknown>) =>
    formMap.set(f.player_id as number, {
      score: f.score as number,
      confidence: f.confidence as number,
    })
  );

  // Build candidate list
  const candidates: PlayerCandidate[] = [];
  for (const pxi of playingXI) {
    const player = players?.find((p: Record<string, unknown>) => p.id === pxi.player_id);
    if (!player) continue;

    const form = formMap.get(player.id as number) || { score: 5, confidence: 0.3 };
    const teamName = teamMap.get(pxi.team_id as number) || 'Unknown';

    // Estimate expected fantasy points
    const expectedPoints = estimateFantasyPoints(
      player.role as string,
      form.score,
      config
    );

    const reasoning = generatePickReasoning(
      player.name as string,
      player.role as string,
      form.score,
      expectedPoints
    );

    candidates.push({
      player_id: player.id as number,
      player_name: player.name as string,
      team_id: pxi.team_id as number,
      team_name: teamName,
      role: player.role as string,
      expected_points: expectedPoints,
      form_score: form.score,
      reasoning,
      confidence: form.confidence,
    });
  }

  // Select optimal XI respecting constraints
  const selectedXI = selectOptimalXI(
    candidates,
    fixture.team1_id,
    fixture.team2_id
  );

  if (!selectedXI || selectedXI.length !== 11) return null;

  const picks: DreamTeamPick[] = selectedXI.map(c => ({
    player_id: c.player_id,
    player_name: c.player_name,
    team: c.team_name,
    role: c.role,
    expected_points: Math.round(c.expected_points * 10) / 10,
    reasoning: c.reasoning,
    form_score: c.form_score,
  }));

  const totalPoints = picks.reduce((s, p) => s + p.expected_points, 0);
  const confidence = computeDreamTeamConfidence(
    selectedXI.map(c => c.confidence)
  );

  return {
    fixture_id: fixtureId,
    players: picks.sort((a, b) => {
      const roleOrder: Record<string, number> = { wicketkeeper: 1, batter: 2, allrounder: 3, bowler: 4 };
      return (roleOrder[a.role] || 5) - (roleOrder[b.role] || 5);
    }),
    total_expected_points: Math.round(totalPoints * 10) / 10,
    confidence: confidence.value,
    computed_at: new Date().toISOString(),
  };
}

// ─── OPTIMAL XI SELECTOR ───

function selectOptimalXI(
  candidates: PlayerCandidate[],
  team1Id: number,
  team2Id: number
): PlayerCandidate[] | null {
  // Sort by expected points descending
  const sorted = [...candidates].sort(
    (a, b) => b.expected_points - a.expected_points
  );

  const selected: PlayerCandidate[] = [];
  const counts = { wicketkeeper: 0, batter: 0, allrounder: 0, bowler: 0 };
  const teamCounts = new Map<number, number>();
  teamCounts.set(team1Id, 0);
  teamCounts.set(team2Id, 0);

  const c = DREAM_TEAM_CONSTRAINTS;

  // First pass: ensure minimums from each role
  const roleMinimums: Record<string, number> = {
    wicketkeeper: c.wicketkeeper.min,
    batter: c.batter.min,
    allrounder: c.allrounder.min,
    bowler: c.bowler.min,
  };

  for (const role of Object.keys(roleMinimums)) {
    const needed = roleMinimums[role];
    const rolePlayers = sorted.filter(
      p =>
        p.role === role &&
        !selected.includes(p) &&
        (teamCounts.get(p.team_id) || 0) < c.maxFromOneTeam
    );

    for (let i = 0; i < needed && i < rolePlayers.length; i++) {
      selected.push(rolePlayers[i]);
      counts[role as keyof typeof counts]++;
      teamCounts.set(
        rolePlayers[i].team_id,
        (teamCounts.get(rolePlayers[i].team_id) || 0) + 1
      );
    }
  }

  // Second pass: fill remaining slots with best available
  const remaining = c.total - selected.length;
  for (let i = 0; i < remaining; i++) {
    const best = sorted.find(p => {
      if (selected.includes(p)) return false;

      const role = p.role as keyof typeof counts;
      const max = c[role as keyof typeof c];
      if (typeof max === 'object' && 'max' in max) {
        if (counts[role] >= max.max) return false;
      }

      if ((teamCounts.get(p.team_id) || 0) >= c.maxFromOneTeam) return false;

      return true;
    });

    if (best) {
      selected.push(best);
      counts[best.role as keyof typeof counts]++;
      teamCounts.set(
        best.team_id,
        (teamCounts.get(best.team_id) || 0) + 1
      );
    }
  }

  // Validate: at least 1 from each team
  const team1Count = teamCounts.get(team1Id) || 0;
  const team2Count = teamCounts.get(team2Id) || 0;

  if (team1Count < 1 || team2Count < 1) {
    return null; // Invalid selection
  }

  return selected;
}

// ─── FANTASY POINTS ESTIMATOR ───

function estimateFantasyPoints(
  role: string,
  formScore: number,
  config: FantasyPointsConfig
): number {
  // Base expected points by role (calibrated to Dream11)
  const basePoints: Record<string, number> = {
    batter: 28,
    wicketkeeper: 32,
    allrounder: 38,
    bowler: 30,
    unknown: 25,
  };

  const base = basePoints[role] || 25;
  // Scale by form score (0-10 maps to 0.5x-1.5x)
  const formMultiplier = 0.5 + (formScore / 10);

  return base * formMultiplier + config.bonus.playing_xi;
}

// ─── PICK REASONING ───

function generatePickReasoning(
  name: string,
  role: string,
  formScore: number,
  expectedPoints: number
): string[] {
  const reasons: string[] = [];

  if (formScore >= 8) reasons.push(`Elite form — score ${formScore.toFixed(1)}/10`);
  else if (formScore >= 6) reasons.push(`Strong form — score ${formScore.toFixed(1)}/10`);
  else if (formScore >= 4) reasons.push(`Moderate form — score ${formScore.toFixed(1)}/10`);

  if (role === 'allrounder') reasons.push('All-round contribution potential (bat + bowl points)');
  if (role === 'wicketkeeper') reasons.push('WK bonus points for catches/stumpings');

  reasons.push(`Expected ~${Math.round(expectedPoints)} fantasy points`);

  return reasons;
}

// ─── CAPTAIN PICKER ───

export async function getCaptainPicks(
  fixtureId: number,
  limit: number = 3
): Promise<CaptainPick[]> {
  const db = getSupabaseClient();

  // Get playing XI with details
  const { data: playingXI } = await db
    .from('playing_xi')
    .select('player_id, team_id')
    .eq('fixture_id', fixtureId);

  if (!playingXI || playingXI.length === 0) return [];

  const playerIds = playingXI.map((p: Record<string, unknown>) => p.player_id as number);

  // Get player info
  const { data: players } = await db
    .from('players')
    .select('id, name, role')
    .in('id', playerIds);

  // Get form scores
  const { data: formScores } = await db
    .from('form_scores')
    .select('player_id, score, trend, confidence')
    .in('player_id', playerIds)
    .eq('score_type', 'overall');

  // Get team names
  const teamIds = [...new Set(playingXI.map((p: Record<string, unknown>) => p.team_id as number))];
  const { data: teams } = await db
    .from('teams')
    .select('id, short_name, name')
    .in('id', teamIds);

  const teamMap = new Map<number, string>();
  teams?.forEach((t: Record<string, unknown>) =>
    teamMap.set(t.id as number, (t.short_name || t.name) as string)
  );

  const playerTeamMap = new Map<number, number>();
  playingXI.forEach((p: Record<string, unknown>) =>
    playerTeamMap.set(p.player_id as number, p.team_id as number)
  );

  // Score each player for captain
  const captainScores: {
    player: Record<string, unknown>;
    score: number;
    formScore: number;
    trend: string;
    confidence: number;
  }[] = [];

  for (const player of players || []) {
    const form = formScores?.find(
      (f: Record<string, unknown>) => f.player_id === player.id
    );
    const formValue = (form?.score as number) || 5;
    const trend = (form?.trend as string) || 'stable';
    const confidence = (form?.confidence as number) || 0.3;

    // Captain score weights (from PRD):
    // Form 35%, Venue 25%, Matchups 20%, Consistency 10%, Role ceiling 10%
    let captainScore = 0;
    captainScore += formValue * 0.35;    // Form component
    captainScore += 5 * 0.25;            // Venue placeholder (would need match-specific data)
    captainScore += 5 * 0.20;            // Matchup placeholder
    captainScore += (trend === 'improving' ? 7 : trend === 'stable' ? 5 : 3) * 0.10;
    captainScore += (player.role === 'allrounder' ? 8 : player.role === 'wicketkeeper' ? 6 : 5) * 0.10;

    captainScores.push({
      player,
      score: captainScore,
      formScore: formValue,
      trend,
      confidence,
    });
  }

  // Sort by captain score
  captainScores.sort((a, b) => b.score - a.score);

  // Build picks
  const picks: CaptainPick[] = captainScores.slice(0, limit).map((c, i) => {
    const teamId = playerTeamMap.get(c.player.id as number) || 0;
    const teamName = teamMap.get(teamId) || 'Unknown';

    const riskLevel: CaptainPick['risk_level'] =
      i === 0 ? 'safe' : i === 1 ? 'moderate' : 'risky';

    const reasoning: string[] = [];
    reasoning.push(`Form: ${c.formScore.toFixed(1)}/10 (${c.trend})`);
    if (c.player.role === 'allrounder') reasoning.push('All-rounder — dual point-scoring potential');
    if (c.confidence >= 0.7) reasoning.push('High data confidence');
    reasoning.push(`Captain score: ${c.score.toFixed(2)}`);

    return {
      rank: i + 1,
      player_id: c.player.id as number,
      player_name: c.player.name as string,
      team: teamName,
      captain_score: Math.round(c.score * 100) / 100,
      risk_level: riskLevel,
      reasoning,
      anti_pick_warning: null, // Would be populated from matchup analysis
    };
  });

  return picks;
}

// ─── DIFFERENTIAL FINDER ───

export async function getDifferentials(
  fixtureId: number,
  limit: number = 5
): Promise<DreamTeamPick[]> {
  const db = getSupabaseClient();

  // Get playing XI
  const { data: playingXI } = await db
    .from('playing_xi')
    .select('player_id, team_id')
    .eq('fixture_id', fixtureId);

  if (!playingXI) return [];

  const playerIds = playingXI.map((p: Record<string, unknown>) => p.player_id as number);

  // Get players with form
  const { data: players } = await db
    .from('players')
    .select('id, name, role')
    .in('id', playerIds);

  const { data: formScores } = await db
    .from('form_scores')
    .select('player_id, score, confidence')
    .in('player_id', playerIds)
    .eq('score_type', 'overall');

  const teamIds = [...new Set(playingXI.map((p: Record<string, unknown>) => p.team_id as number))];
  const { data: teams } = await db
    .from('teams')
    .select('id, short_name, name')
    .in('id', teamIds);

  const teamMap = new Map<number, string>();
  teams?.forEach((t: Record<string, unknown>) =>
    teamMap.set(t.id as number, (t.short_name || t.name) as string)
  );

  const playerTeamMap = new Map<number, number>();
  playingXI.forEach((p: Record<string, unknown>) =>
    playerTeamMap.set(p.player_id as number, p.team_id as number)
  );

  // Differentials: players with decent form but likely low ownership
  // (not the obvious picks — mid-order batters, secondary bowlers, etc.)
  const differentials: DreamTeamPick[] = [];

  for (const player of players || []) {
    const form = formScores?.find(
      (f: Record<string, unknown>) => f.player_id === player.id
    );
    const formValue = (form?.score as number) || 0;

    // Good differentials: decent form (4-7) but not obvious picks
    if (formValue >= 4 && formValue <= 7.5) {
      const teamId = playerTeamMap.get(player.id as number) || 0;
      const teamName = teamMap.get(teamId) || 'Unknown';

      differentials.push({
        player_id: player.id as number,
        player_name: player.name as string,
        team: teamName,
        role: player.role as string,
        expected_points: estimateFantasyPoints(player.role as string, formValue, DREAM11_T20_SCORING),
        reasoning: [
          `Under-the-radar pick — form ${formValue.toFixed(1)}/10`,
          'Low expected ownership = high differential value',
          player.role === 'allrounder' ? 'All-round upside' : `Solid ${player.role} pick`,
        ],
        form_score: formValue,
      });
    }
  }

  // Sort by expected points
  differentials.sort((a, b) => b.expected_points - a.expected_points);
  return differentials.slice(0, limit);
}
