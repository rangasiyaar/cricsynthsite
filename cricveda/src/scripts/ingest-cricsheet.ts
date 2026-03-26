// ============================================================
// CricVeda — CricSheet Ingestion Pipeline (F1.1)
// ============================================================
// Downloads and parses ball-by-ball data from CricSheet (CC BY 4.0)
// into the CricVeda database.

import { getSupabaseClient } from '@/lib/db/supabase';
import * as fs from 'fs';
import * as path from 'path';

// ─── CONFIGURATION ───

const CRICSHEET_BASE_URL = 'https://cricsheet.org/downloads';
const DATA_DIR = path.join(process.cwd(), 'data', 'cricsheet');

// League mapping from CricSheet folder names
const LEAGUE_MAP: Record<string, string> = {
  'ipl': 'ipl',
  't20is': 't20i',
  'bbl': 'bbl',
  'psl': 'psl',
  'cpl': 'cpl',
  'the_hundred': 'hundred',
  'sa20': 'sa20',
  'lpl': 'lpl',
  'bpl': 'bpl',
  'ilt20': 'ilt20',
  'mlc': 'mlc',
  'smat': 'smat',
  'blast': 'blast',
};

// ─── MAIN INGESTION ───

export async function ingestCricSheetData(dataDir?: string): Promise<{
  matches: number;
  deliveries: number;
  players: number;
  errors: string[];
}> {
  const dir = dataDir || DATA_DIR;
  const stats = { matches: 0, deliveries: 0, players: 0, errors: [] as string[] };
  const db = getSupabaseClient();

  console.log(`[Ingest] Starting CricSheet ingestion from ${dir}`);

  // Check if directory exists
  if (!fs.existsSync(dir)) {
    console.log(`[Ingest] Data directory not found: ${dir}`);
    stats.errors.push(`Data directory not found: ${dir}`);
    return stats;
  }

  // Process each JSON file in the directory
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  console.log(`[Ingest] Found ${files.length} JSON files`);

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const matchData = JSON.parse(raw);

      const result = await processMatch(db, matchData, file);
      stats.matches += result.matches;
      stats.deliveries += result.deliveries;
      stats.players += result.players;
    } catch (err) {
      const message = `Error processing ${file}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[Ingest] ${message}`);
      stats.errors.push(message);
    }
  }

  console.log(`[Ingest] Complete: ${stats.matches} matches, ${stats.deliveries} deliveries, ${stats.players} new players`);
  return stats;
}

// ─── PROCESS SINGLE MATCH ───

async function processMatch(
  db: ReturnType<typeof getSupabaseClient>,
  data: CricSheetMatch,
  filename: string
): Promise<{ matches: number; deliveries: number; players: number }> {
  const result = { matches: 0, deliveries: 0, players: 0 };

  const info = data.info;
  if (!info) return result;

  // Only T20 matches
  if (info.overs !== 20 && info.match_type !== 'T20') return result;

  // Determine league
  const leagueId = detectLeague(info, filename);
  if (!leagueId) return result;

  // Check if already ingested
  const cricsheetId = filename.replace('.json', '');
  const { data: existing } = await db
    .from('matches')
    .select('id')
    .eq('cricsheet_id', cricsheetId)
    .single();

  if (existing) return result; // Already ingested

  // Ensure teams exist
  const team1Name = Array.isArray(info.teams) ? info.teams[0] : '';
  const team2Name = Array.isArray(info.teams) ? info.teams[1] : '';

  const team1Id = await ensureTeam(db, team1Name, leagueId);
  const team2Id = await ensureTeam(db, team2Name, leagueId);

  if (!team1Id || !team2Id) return result;

  // Ensure venue exists
  const venueId = info.venue ? await ensureVenue(db, info.venue, info.city) : null;

  // Determine winner
  const winnerId = info.outcome?.winner === team1Name ? team1Id :
    info.outcome?.winner === team2Name ? team2Id : null;

  // Insert match
  const { data: match, error: matchError } = await db
    .from('matches')
    .insert({
      cricsheet_id: cricsheetId,
      league_id: leagueId,
      season: info.season || null,
      date: Array.isArray(info.dates) ? info.dates[0] : info.dates,
      venue_id: venueId,
      team1_id: team1Id,
      team2_id: team2Id,
      toss_winner_id: info.toss?.winner === team1Name ? team1Id : team2Id,
      toss_decision: info.toss?.decision || null,
      winner_id: winnerId,
      result: info.outcome?.by ? Object.keys(info.outcome.by)[0] : null,
      result_margin: info.outcome?.by ? Object.values(info.outcome.by)[0] as number : null,
      is_completed: true,
      is_ingested: true,
    })
    .select('id')
    .single();

  if (matchError || !match) return result;
  result.matches = 1;

  // Process innings and deliveries
  if (data.innings) {
    for (let inningsIdx = 0; inningsIdx < data.innings.length; inningsIdx++) {
      const innings = data.innings[inningsIdx];
      if (!innings.overs) continue;

      let inningsRuns = 0;
      let inningsWickets = 0;

      for (const over of innings.overs) {
        for (let ballIdx = 0; ballIdx < over.deliveries.length; ballIdx++) {
          const delivery = over.deliveries[ballIdx];

          // Ensure players exist
          const batterId = await ensurePlayer(db, delivery.batter);
          const bowlerId = await ensurePlayer(db, delivery.bowler);
          const nonStrikerId = delivery.non_striker ? await ensurePlayer(db, delivery.non_striker) : null;

          if (!batterId || !bowlerId) continue;

          const runsBatter = delivery.runs?.batter || 0;
          const runsExtras = delivery.runs?.extras || 0;
          const runsTotal = delivery.runs?.total || 0;

          inningsRuns += runsTotal;

          const isWicket = !!delivery.wickets && delivery.wickets.length > 0;
          if (isWicket) inningsWickets++;

          const wicketInfo = isWicket ? delivery.wickets?.[0] ?? null : null;
          const wicketPlayerId = wicketInfo?.player_out ? await ensurePlayer(db, wicketInfo.player_out) : null;

          const { error: delError } = await db.from('deliveries').insert({
            match_id: match.id,
            innings: inningsIdx + 1,
            over_number: over.over,
            ball_number: ballIdx + 1,
            batter_id: batterId,
            bowler_id: bowlerId,
            non_striker_id: nonStrikerId,
            runs_batter: runsBatter,
            runs_extras: runsExtras,
            runs_total: runsTotal,
            extra_type: delivery.extras ? Object.keys(delivery.extras)[0] : null,
            is_wicket: isWicket,
            wicket_kind: wicketInfo?.kind || null,
            wicket_player_id: wicketPlayerId,
            is_boundary: runsBatter === 4,
            is_six: runsBatter === 6,
            is_dot: runsTotal === 0 && !delivery.extras,
          });

          if (!delError) result.deliveries++;
        }
      }

      // Update match scores
      const scoreField = inningsIdx === 0 ? 'team1_score' : 'team2_score';
      const wicketField = inningsIdx === 0 ? 'team1_wickets' : 'team2_wickets';
      await db.from('matches').update({
        [scoreField]: inningsRuns,
        [wicketField]: inningsWickets,
      }).eq('id', match.id);
    }
  }

  return result;
}

// ─── HELPER: Ensure team exists ───

async function ensureTeam(
  db: ReturnType<typeof getSupabaseClient>,
  name: string,
  leagueId: string
): Promise<number | null> {
  if (!name) return null;

  const { data: existing } = await db
    .from('teams')
    .select('id')
    .eq('name', name)
    .eq('league_id', leagueId)
    .single();

  if (existing) return existing.id;

  const { data: created } = await db
    .from('teams')
    .insert({ name, league_id: leagueId })
    .select('id')
    .single();

  return created?.id || null;
}

// ─── HELPER: Ensure venue exists ───

async function ensureVenue(
  db: ReturnType<typeof getSupabaseClient>,
  name: string,
  city?: string
): Promise<number | null> {
  const { data: existing } = await db
    .from('venues')
    .select('id')
    .eq('name', name)
    .single();

  if (existing) return existing.id;

  const { data: created } = await db
    .from('venues')
    .insert({ name, city: city || null })
    .select('id')
    .single();

  return created?.id || null;
}

// ─── HELPER: Ensure player exists ───

const playerCache = new Map<string, number>();

async function ensurePlayer(
  db: ReturnType<typeof getSupabaseClient>,
  name: string
): Promise<number | null> {
  if (!name) return null;

  // Check in-memory cache first
  if (playerCache.has(name)) return playerCache.get(name)!;

  const cricsheetId = name.toLowerCase().replace(/\s+/g, '_');

  const { data: existing } = await db
    .from('players')
    .select('id')
    .eq('cricsheet_id', cricsheetId)
    .single();

  if (existing) {
    playerCache.set(name, existing.id);
    return existing.id;
  }

  const { data: created } = await db
    .from('players')
    .insert({
      cricsheet_id: cricsheetId,
      name,
      metadata_source: 'cricsheet',
    })
    .select('id')
    .single();

  if (created) {
    playerCache.set(name, created.id);
    return created.id;
  }

  return null;
}

// ─── HELPER: Detect league ───

function detectLeague(info: CricSheetMatchInfo, filename: string): string | null {
  // Check event name
  if (info.event?.name) {
    const eventLower = info.event.name.toLowerCase();
    if (eventLower.includes('indian premier league') || eventLower.includes('ipl')) return 'ipl';
    if (eventLower.includes('big bash')) return 'bbl';
    if (eventLower.includes('pakistan super league') || eventLower.includes('psl')) return 'psl';
    if (eventLower.includes('caribbean premier league') || eventLower.includes('cpl')) return 'cpl';
    if (eventLower.includes('hundred')) return 'hundred';
    if (eventLower.includes('sa20')) return 'sa20';
    if (eventLower.includes('lanka premier')) return 'lpl';
    if (eventLower.includes('bangladesh premier')) return 'bpl';
    if (eventLower.includes('international league t20')) return 'ilt20';
    if (eventLower.includes('major league cricket')) return 'mlc';
    if (eventLower.includes('syed mushtaq ali')) return 'smat';
    if (eventLower.includes('vitality blast')) return 'blast';
  }

  // Check match type for T20I
  if (info.match_type === 'T20' && info.team_type === 'international') return 't20i';

  // Check filename for league hint
  for (const [key, value] of Object.entries(LEAGUE_MAP)) {
    if (filename.toLowerCase().includes(key)) return value;
  }

  return 't20i'; // Default fallback
}

// ─── CRICSHEET DATA TYPES ───

interface CricSheetMatch {
  info: CricSheetMatchInfo;
  innings?: CricSheetInnings[];
}

interface CricSheetMatchInfo {
  dates: string | string[];
  teams: string[];
  venue?: string;
  city?: string;
  overs?: number;
  match_type?: string;
  team_type?: string;
  season?: string;
  event?: { name: string; match_number?: number };
  toss?: { winner: string; decision: string };
  outcome?: {
    winner?: string;
    by?: Record<string, number>;
  };
}

interface CricSheetInnings {
  team: string;
  overs: {
    over: number;
    deliveries: CricSheetDelivery[];
  }[];
}

interface CricSheetDelivery {
  batter: string;
  bowler: string;
  non_striker?: string;
  runs?: { batter: number; extras: number; total: number };
  extras?: Record<string, number>;
  wickets?: { kind: string; player_out: string }[];
}
