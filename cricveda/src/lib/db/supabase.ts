// ============================================================
// CricVeda — Supabase Database Client
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let serviceInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

export function getServiceClient(): SupabaseClient {
  if (serviceInstance) return serviceInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  serviceInstance = createClient(url, key);
  return serviceInstance;
}

// ─── Query Helpers ───

export async function queryOne<T>(
  table: string,
  column: string,
  value: string | number
): Promise<T | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from(table)
    .select('*')
    .eq(column, value)
    .single();

  if (error) return null;
  return data as T;
}

export async function queryMany<T>(
  table: string,
  filters?: Record<string, string | number | boolean>,
  options?: { page?: number; perPage?: number; orderBy?: string; ascending?: boolean }
): Promise<{ data: T[]; count: number }> {
  const db = getServiceClient();
  let query = db.from(table).select('*', { count: 'exact' });

  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      query = query.eq(key, val);
    }
  }

  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }

  if (options?.page && options?.perPage) {
    const from = (options.page - 1) * options.perPage;
    const to = from + options.perPage - 1;
    query = query.range(from, to);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error(`queryMany(${table}) error:`, error.message);
    return { data: [], count: 0 };
  }

  return { data: (data as T[]) || [], count: count || 0 };
}

export async function insertOne<T>(
  table: string,
  row: Record<string, unknown>
): Promise<T | null> {
  const db = getServiceClient();
  const { data, error } = await db.from(table).insert(row).select().single();

  if (error) {
    console.error(`insertOne(${table}) error:`, error.message);
    return null;
  }
  return data as T;
}

export async function updateOne(
  table: string,
  id: string | number,
  updates: Record<string, unknown>,
  idColumn: string = 'id'
): Promise<boolean> {
  const db = getServiceClient();
  const { error } = await db.from(table).update(updates).eq(idColumn, id);

  if (error) {
    console.error(`updateOne(${table}) error:`, error.message);
    return false;
  }
  return true;
}

export async function rawQuery<T>(sql: string): Promise<T[]> {
  const db = getServiceClient();
  const { data, error } = await db.rpc('raw_sql', { query: sql });

  if (error) {
    console.error('rawQuery error:', error.message);
    return [];
  }
  return (data as T[]) || [];
}
