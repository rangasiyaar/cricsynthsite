// ============================================================
// CricVeda — Confidence Scorer (F2.9)
// ============================================================
// Every analytical output has a confidence score reflecting
// data depth and reliability. Transparency is a feature.

import { ConfidenceScore } from '@/lib/types';

// ─── THRESHOLDS ───

const CONFIDENCE_TIERS = {
  VERY_HIGH: { min: 0.85, label: 'very_high' as const, depth: 'Veteran with deep multi-league data' },
  HIGH:      { min: 0.70, label: 'high' as const, depth: 'Experienced player with solid data coverage' },
  MODERATE:  { min: 0.50, label: 'moderate' as const, depth: 'Limited data or first time in league' },
  LOW:       { min: 0.25, label: 'low' as const, depth: 'Domestic debut or minimal data available' },
  VERY_LOW:  { min: 0.00, label: 'very_low' as const, depth: 'Essentially no useful data' },
};

// ─── MAIN FUNCTION ───

export function computeConfidence(
  matchesUsed: number,
  leaguesUsed: number,
  mostRecentDate?: string,
  minBalls?: number
): ConfidenceScore {
  let value = 0;

  // Factor 1: Number of matches (0-0.4)
  if (matchesUsed >= 15) value += 0.40;
  else if (matchesUsed >= 10) value += 0.32;
  else if (matchesUsed >= 6) value += 0.24;
  else if (matchesUsed >= 3) value += 0.15;
  else if (matchesUsed >= 1) value += 0.08;

  // Factor 2: Number of leagues (0-0.25)
  if (leaguesUsed >= 4) value += 0.25;
  else if (leaguesUsed >= 3) value += 0.20;
  else if (leaguesUsed >= 2) value += 0.15;
  else if (leaguesUsed >= 1) value += 0.08;

  // Factor 3: Data recency (0-0.2)
  if (mostRecentDate) {
    const daysSince = Math.floor(
      (Date.now() - new Date(mostRecentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince <= 14) value += 0.20;
    else if (daysSince <= 30) value += 0.16;
    else if (daysSince <= 60) value += 0.12;
    else if (daysSince <= 120) value += 0.06;
    // Older than 120 days: no recency bonus
  }

  // Factor 4: Sample size for matchups (0-0.15)
  if (minBalls !== undefined) {
    if (minBalls >= 30) value += 0.15;
    else if (minBalls >= 18) value += 0.12;
    else if (minBalls >= 12) value += 0.08;
    else if (minBalls >= 6) value += 0.04;
    // <6 balls: flagged as insufficient
  } else {
    // No ball-level data needed (e.g., form score)
    value += 0.10;
  }

  // Clamp to [0, 1]
  value = Math.max(0, Math.min(1, value));
  value = Math.round(value * 100) / 100;

  // Determine tier
  let tier = CONFIDENCE_TIERS.VERY_LOW;
  if (value >= CONFIDENCE_TIERS.VERY_HIGH.min) tier = CONFIDENCE_TIERS.VERY_HIGH;
  else if (value >= CONFIDENCE_TIERS.HIGH.min) tier = CONFIDENCE_TIERS.HIGH;
  else if (value >= CONFIDENCE_TIERS.MODERATE.min) tier = CONFIDENCE_TIERS.MODERATE;
  else if (value >= CONFIDENCE_TIERS.LOW.min) tier = CONFIDENCE_TIERS.LOW;

  // Determine data sources
  const dataSources = ['cricsheet'];
  if (leaguesUsed > 1) dataSources.push('cross-league');

  return {
    value,
    label: tier.label,
    data_depth: tier.depth,
    data_sources: dataSources,
  };
}

// ─── MATCHUP CONFIDENCE ───

export function computeMatchupConfidence(
  totalBalls: number,
  leaguesCount: number,
  mostRecentDate?: string
): ConfidenceScore {
  return computeConfidence(
    Math.ceil(totalBalls / 24), // approximate matches (4 overs per match interaction)
    leaguesCount,
    mostRecentDate,
    totalBalls
  );
}

// ─── VENUE CONFIDENCE ───

export function computeVenueConfidence(
  matchesAtVenue: number,
  recentMatchDate?: string
): ConfidenceScore {
  return computeConfidence(
    matchesAtVenue,
    1, // venues are single-location
    recentMatchDate
  );
}

// ─── DREAM TEAM CONFIDENCE ───

export function computeDreamTeamConfidence(
  playerConfidences: number[]
): ConfidenceScore {
  if (playerConfidences.length === 0) {
    return {
      value: 0,
      label: 'very_low',
      data_depth: 'No player data available',
      data_sources: [],
    };
  }

  // Team confidence = average of player confidences * penalty for low outliers
  const avg =
    playerConfidences.reduce((s, c) => s + c, 0) / playerConfidences.length;
  const minConf = Math.min(...playerConfidences);
  const penalty = minConf < 0.3 ? 0.85 : 1.0; // Penalize if any player has very low confidence

  const value = Math.round(avg * penalty * 100) / 100;

  let label: ConfidenceScore['label'] = 'very_low';
  let depth = 'Limited team data';
  if (value >= 0.85) { label = 'very_high'; depth = 'Strong data coverage for all players'; }
  else if (value >= 0.70) { label = 'high'; depth = 'Good data coverage, some gaps'; }
  else if (value >= 0.50) { label = 'moderate'; depth = 'Mixed data coverage across team'; }
  else if (value >= 0.25) { label = 'low'; depth = 'Several players with limited data'; }

  return { value, label, data_depth: depth, data_sources: ['cricsheet'] };
}
