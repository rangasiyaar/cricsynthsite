// ============================================================
// CricVeda — Supabase Client
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    );
  }

  supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  return supabase;
}

// Browser client for client-side operations
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase public credentials.');
  }

  browserClient = createClient(url, key);
  return browserClient;
}

// ─── QUERY HELPERS ───

export async function fetchOne<T>(
  table: string,
  match: Record<string, unknown>
): Promise<T | null> {
  const db = getSupabaseClient();
  let query = db.from(table).select('*');

  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }

  const { data, error } = await query.single();
  if (error) return null;
  return data as T;
}

export async function fetchMany<T>(
  table: string,
  options: {
    match?: Record<string, unknown>;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ data: T[]; count: number }> {
  const db = getSupabaseClient();
  let query = db.from(table).select('*', { count: 'exact' });

  if (options.match) {
    for (const [key, value] of Object.entries(options.match)) {
      query = query.eq(key, value);
    }
  }

  if (options.orderBy) {
    query = query.order(options.orderBy, {
      ascending: options.ascending ?? false,
    });
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error(`[DB] Error fetching from ${table}:`, error.message);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as T[], count: count || 0 };
}

export async function upsert<T>(
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[],
  conflictColumns?: string
): Promise<T[] | null> {
  const db = getSupabaseClient();
  const query = db.from(table).upsert(data, {
    onConflict: conflictColumns,
    ignoreDuplicates: false,
  });

  const { data: result, error } = await query.select();

  if (error) {
    console.error(`[DB] Error upserting to ${table}:`, error.message);
    return null;
  }

  return result as T[];
}

export async function rawQuery(sql: string, params?: unknown[]): Promise<unknown> {
  const db = getSupabaseClient();
  const { data, error } = await db.rpc('exec_sql', {
    query: sql,
    params: params || [],
  });

  if (error) {
    console.error('[DB] Raw query error:', error.message);
    throw error;
  }

  return data;
}
