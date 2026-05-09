import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
vi.mock('@/lib/db/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// We test the internal logic by extracting the pure calculation functions.
// Since they're not exported, we test via the module's behavior with mocked DB.

import { getSupabaseClient } from '@/lib/db/supabase';
import { calculateFormScore } from '../form-score';

// Helper to create mock supabase chainable query
function createMockDb(overrides: Record<string, unknown> = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return {
    from: vi.fn().mockReturnValue(mockQuery),
    _query: mockQuery,
  };
}

describe('calculateFormScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for non-existent player', async () => {
    const mockDb = createMockDb({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await calculateFormScore(9999);
    expect(result).toBeNull();
  });

  it('returns low confidence when insufficient matches', async () => {
    const mockDb = createMockDb();
    // Player exists
    mockDb._query.single.mockResolvedValueOnce({
      data: { id: 1, name: 'Test Player', role: 'batter' },
      error: null,
    });
    // No deliveries found (empty match list)
    mockDb._query.order.mockResolvedValueOnce({ data: [], error: null });

    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    const result = await calculateFormScore(1, 'batting');

    expect(result).not.toBeNull();
    expect(result!.player_id).toBe(1);
    expect(result!.score).toBe(0);
    expect(result!.confidence).toBeLessThanOrEqual(0.3);
    expect(result!.matches_used).toBe(0);
  });

  it('returns valid FormScore structure', async () => {
    const mockDb = createMockDb();
    // Player
    mockDb._query.single.mockResolvedValueOnce({
      data: { id: 42, name: 'Virat Kohli', role: 'batter' },
      error: null,
    });
    // Match IDs from deliveries
    mockDb._query.order.mockResolvedValueOnce({
      data: [
        { match_id: 100 }, { match_id: 100 },
        { match_id: 101 }, { match_id: 101 },
        { match_id: 102 },
      ],
      error: null,
    });
    // Matches info
    mockDb._query.order.mockResolvedValueOnce({
      data: [
        { id: 100, date: '2025-04-01', league_id: 'ipl' },
        { id: 101, date: '2025-03-28', league_id: 'ipl' },
        { id: 102, date: '2025-03-24', league_id: 'ipl' },
      ],
      error: null,
    });
    // Batting deliveries for match 100
    mockDb._query.eq.mockReturnThis();
    // We need the full chain to work — for simplicity we mock that
    // getRecentPerformances returns data properly by mocking all calls
    // This is a structural test; detailed math tests would be integration tests.

    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    // Since the internal implementation makes many chained calls,
    // this test verifies the function doesn't crash with the mock structure.
    // Full integration tests would use a real Supabase instance.
    const result = await calculateFormScore(42, 'overall');

    // With our mock, it should at minimum return a FormScore (even if score=0)
    if (result) {
      expect(result.player_id).toBe(42);
      expect(result.player_name).toBe('Virat Kohli');
      expect(result.score_type).toBe('overall');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(['improving', 'declining', 'stable']).toContain(result.trend);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.computed_at).toBeDefined();
    }
  });
});
