// ============================================================
// CricVeda — API Key Auth (F3.7)
// ============================================================

import { createHash, randomBytes } from 'crypto';
import { getSupabaseClient } from '@/lib/db/supabase';
import { ApiKey } from '@/lib/types';

// ─── GENERATE API KEY ───

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `cv_${randomBytes(24).toString('hex')}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 11); // "cv_" + first 8 hex chars

  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ─── CREATE API KEY FOR USER ───

export async function createApiKey(
  userId: string,
  name: string = 'Default'
): Promise<{ key: string; apiKey: ApiKey } | null> {
  const db = getSupabaseClient();

  const { key, hash, prefix } = generateApiKey();

  const { data, error } = await db
    .from('api_keys')
    .insert({
      user_id: userId,
      key_hash: hash,
      key_prefix: prefix,
      name,
      tier: 'free',
      daily_limit: 100,
    })
    .select()
    .single();

  if (error) {
    console.error('[Auth] Error creating API key:', error.message);
    return null;
  }

  return { key, apiKey: data as ApiKey };
}

// ─── VALIDATE API KEY ───

export async function validateApiKey(
  key: string
): Promise<ApiKey | null> {
  const db = getSupabaseClient();
  const hash = hashApiKey(key);

  const { data, error } = await db
    .from('api_keys')
    .select('*')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  // Update last used
  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return data as ApiKey;
}

// ─── REVOKE API KEY ───

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const db = getSupabaseClient();

  const { error } = await db
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId);

  return !error;
}

// ─── REGENERATE API KEY ───

export async function regenerateApiKey(
  userId: string
): Promise<{ key: string; apiKey: ApiKey } | null> {
  const db = getSupabaseClient();

  // Revoke all existing keys
  await db
    .from('api_keys')
    .update({ is_active: false })
    .eq('user_id', userId);

  // Create new one
  return createApiKey(userId);
}
