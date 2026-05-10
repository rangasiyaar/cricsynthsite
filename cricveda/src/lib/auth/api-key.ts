// ============================================================
// CricVeda — API Key Management
// ============================================================

import { createHash, randomBytes } from 'crypto';
import { getServiceClient } from '@/lib/db/supabase';
import type { ApiKey } from '@/lib/types';

const KEY_PREFIX = 'cs_';

export function generateApiKey(): string {
  const bytes = randomBytes(24);
  return KEY_PREFIX + bytes.toString('hex');
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 11);
}

export async function createApiKey(
  userId: string,
  name: string = 'Default'
): Promise<{ key: string; record: ApiKey } | null> {
  const plainKey = generateApiKey();
  const hash = hashKey(plainKey);
  const prefix = getKeyPrefix(plainKey);

  const db = getServiceClient();
  const { data, error } = await db
    .from('api_keys')
    .insert({
      user_id: userId,
      key_prefix: prefix,
      key_hash: hash,
      name,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('createApiKey error:', error.message);
    return null;
  }

  return { key: plainKey, record: data as ApiKey };
}

export async function validateApiKey(
  key: string
): Promise<{ valid: boolean; keyRecord?: ApiKey; userId?: string; plan?: string }> {
  if (!key || !key.startsWith(KEY_PREFIX)) {
    return { valid: false };
  }

  const hash = hashKey(key);
  const db = getServiceClient();

  const { data, error } = await db
    .from('api_keys')
    .select('*, users!api_keys_user_id_fkey(id, plan)')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return { valid: false };
  }

  // Update last_used_at
  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  const user = (data as Record<string, unknown>).users as Record<string, unknown> | undefined;

  return {
    valid: true,
    keyRecord: data as ApiKey,
    userId: user?.id as string,
    plan: (user?.plan as string) || 'free',
  };
}

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { error } = await db
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId);

  return !error;
}

export async function regenerateApiKey(
  keyId: string,
  userId: string
): Promise<{ key: string; record: ApiKey } | null> {
  const revoked = await revokeApiKey(keyId, userId);
  if (!revoked) return null;

  return createApiKey(userId);
}

export async function listUserKeys(userId: string): Promise<ApiKey[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data as ApiKey[]) || [];
}
