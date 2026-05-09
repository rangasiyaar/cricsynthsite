import { describe, it, expect } from 'vitest';
import {
  computeConfidence,
  computeMatchupConfidence,
  computeVenueConfidence,
  computeDreamTeamConfidence,
} from '../confidence';

describe('computeConfidence', () => {
  it('returns very_low for zero data', () => {
    const result = computeConfidence(0, 0, undefined);
    expect(result.value).toBeLessThanOrEqual(0.25);
    expect(result.label).toBe('very_low');
  });

  it('returns moderate+ for decent data', () => {
    const recent = new Date().toISOString();
    const result = computeConfidence(10, 3, recent);
    expect(result.value).toBeGreaterThanOrEqual(0.5);
    expect(['moderate', 'high', 'very_high']).toContain(result.label);
  });

  it('returns high for veteran player data', () => {
    const recent = new Date().toISOString();
    const result = computeConfidence(15, 4, recent);
    expect(result.value).toBeGreaterThanOrEqual(0.7);
    expect(['high', 'very_high']).toContain(result.label);
  });

  it('penalizes stale data', () => {
    const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    const stale = computeConfidence(15, 4, staleDate);
    const fresh = computeConfidence(15, 4, recentDate);

    expect(fresh.value).toBeGreaterThan(stale.value);
  });

  it('rewards multi-league data', () => {
    const date = new Date().toISOString();
    const singleLeague = computeConfidence(10, 1, date);
    const multiLeague = computeConfidence(10, 4, date);

    expect(multiLeague.value).toBeGreaterThan(singleLeague.value);
  });

  it('clamps value to [0, 1]', () => {
    const result = computeConfidence(100, 10, new Date().toISOString(), 100);
    expect(result.value).toBeLessThanOrEqual(1);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });

  it('includes cricsheet in data_sources', () => {
    const result = computeConfidence(5, 1, undefined);
    expect(result.data_sources).toContain('cricsheet');
  });

  it('includes cross-league source when multiple leagues', () => {
    const result = computeConfidence(5, 2, undefined);
    expect(result.data_sources).toContain('cross-league');
  });
});

describe('computeMatchupConfidence', () => {
  it('returns low confidence for few balls', () => {
    const result = computeMatchupConfidence(5, 1, undefined);
    expect(result.value).toBeLessThan(0.5);
  });

  it('returns higher confidence for more balls', () => {
    const recent = new Date().toISOString();
    const few = computeMatchupConfidence(6, 1, recent);
    const many = computeMatchupConfidence(36, 3, recent);

    expect(many.value).toBeGreaterThan(few.value);
  });
});

describe('computeVenueConfidence', () => {
  it('returns low confidence for few matches', () => {
    const result = computeVenueConfidence(2, undefined);
    expect(result.value).toBeLessThan(0.5);
  });

  it('increases with more matches at venue', () => {
    const recent = new Date().toISOString();
    const few = computeVenueConfidence(3, recent);
    const many = computeVenueConfidence(20, recent);

    expect(many.value).toBeGreaterThan(few.value);
  });
});

describe('computeDreamTeamConfidence', () => {
  it('returns very_low for empty array', () => {
    const result = computeDreamTeamConfidence([]);
    expect(result.value).toBe(0);
    expect(result.label).toBe('very_low');
  });

  it('averages player confidences', () => {
    const result = computeDreamTeamConfidence([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
    expect(result.value).toBeGreaterThanOrEqual(0.7);
  });

  it('penalizes when a player has very low confidence', () => {
    const withLow = computeDreamTeamConfidence([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.1]);
    const withoutLow = computeDreamTeamConfidence([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);

    expect(withoutLow.value).toBeGreaterThan(withLow.value);
  });
});
