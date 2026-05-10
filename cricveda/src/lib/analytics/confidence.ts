// ============================================================
// CricVeda — Confidence Scoring System
// ============================================================
// Every analytical output carries a confidence score (0.00–1.00).

import type { ConfidenceScore } from '@/lib/types';

export const CONFIDENCE_TIERS = {
  VERY_HIGH: { threshold: 0.85, label: 'Very High', tier: 'very_high' as const, depth: 'Veteran with deep multi-league data' },
  HIGH:      { threshold: 0.70, label: 'High',      tier: 'high' as const,      depth: 'Experienced player with solid coverage' },
  MODERATE:  { threshold: 0.50, label: 'Moderate',  tier: 'moderate' as const,  depth: 'Limited data or first time in league' },
  LOW:       { threshold: 0.25, label: 'Low',       tier: 'low' as const,       depth: 'Domestic debut or minimal data' },
  VERY_LOW:  { threshold: 0.00, label: 'Very Low',  tier: 'very_low' as const,  depth: 'Essentially no useful data' },
} as const;

type ConfidenceTier = (typeof CONFIDENCE_TIERS)[keyof typeof CONFIDENCE_TIERS];

// ─── Core Confidence Calculator ───

export function computeConfidence(params: {
  matchCount: number;
  leagueCount: number;
  daysSinceLastMatch: number;
  sampleSize?: number;
}): ConfidenceScore {
  const { matchCount, leagueCount, daysSinceLastMatch, sampleSize } = params;

  // Factor 1: Match count (0–0.40)
  const matchFactor = Math.min(matchCount / 15, 1.0) * 0.40;

  // Factor 2: League diversity (0–0.25)
  const leagueFactor = Math.min(leagueCount / 4, 1.0) * 0.25;

  // Factor 3: Data recency (0–0.20)
  let recencyFactor = 0;
  if (daysSinceLastMatch <= 14) recencyFactor = 1.0;
  else if (daysSinceLastMatch <= 30) recencyFactor = 0.8;
  else if (daysSinceLastMatch <= 60) recencyFactor = 0.5;
  else if (daysSinceLastMatch <= 120) recencyFactor = 0.2;
  recencyFactor *= 0.20;

  // Factor 4: Sample size (0–0.15)
  const sampleFactor = sampleSize
    ? Math.min(sampleSize / 30, 1.0) * 0.15
    : 0.075;

  const score = Math.round((matchFactor + leagueFactor + recencyFactor + sampleFactor) * 100) / 100;

  let tier: ConfidenceTier = CONFIDENCE_TIERS.VERY_LOW;
  if (score >= CONFIDENCE_TIERS.VERY_HIGH.threshold) tier = CONFIDENCE_TIERS.VERY_HIGH;
  else if (score >= CONFIDENCE_TIERS.HIGH.threshold) tier = CONFIDENCE_TIERS.HIGH;
  else if (score >= CONFIDENCE_TIERS.MODERATE.threshold) tier = CONFIDENCE_TIERS.MODERATE;
  else if (score >= CONFIDENCE_TIERS.LOW.threshold) tier = CONFIDENCE_TIERS.LOW;

  return {
    score,
    label: tier.label,
    tier: tier.tier,
    depth: tier.depth,
  };
}

// ─── Domain-Specific Confidence ───

export function computeFormConfidence(
  matchCount: number,
  leagueCount: number,
  daysSinceLastMatch: number
): ConfidenceScore {
  return computeConfidence({ matchCount, leagueCount, daysSinceLastMatch });
}

export function computeMatchupConfidence(
  balls: number,
  leagueCount: number,
  daysSinceLastMatch: number
): ConfidenceScore {
  return computeConfidence({
    matchCount: Math.ceil(balls / 6),
    leagueCount,
    daysSinceLastMatch,
    sampleSize: balls,
  });
}

export function computeVenueConfidence(
  matchCount: number,
  daysSinceLastMatch: number
): ConfidenceScore {
  return computeConfidence({
    matchCount,
    leagueCount: 1,
    daysSinceLastMatch,
    sampleSize: matchCount * 2,
  });
}

export function computeDreamTeamConfidence(
  avgPlayerConfidence: number,
  playersWithData: number,
  totalPlayers: number
): ConfidenceScore {
  const coverage = playersWithData / totalPlayers;
  const score = Math.round(avgPlayerConfidence * coverage * 100) / 100;

  let tier: ConfidenceTier = CONFIDENCE_TIERS.VERY_LOW;
  if (score >= CONFIDENCE_TIERS.VERY_HIGH.threshold) tier = CONFIDENCE_TIERS.VERY_HIGH;
  else if (score >= CONFIDENCE_TIERS.HIGH.threshold) tier = CONFIDENCE_TIERS.HIGH;
  else if (score >= CONFIDENCE_TIERS.MODERATE.threshold) tier = CONFIDENCE_TIERS.MODERATE;
  else if (score >= CONFIDENCE_TIERS.LOW.threshold) tier = CONFIDENCE_TIERS.LOW;

  return {
    score,
    label: tier.label,
    tier: tier.tier,
    depth: tier.depth,
  };
}
