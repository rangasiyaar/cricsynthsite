import { NextRequest, NextResponse } from 'next/server';
import { listUserKeys, createApiKey, revokeApiKey, regenerateApiKey } from '@/lib/auth/api-key';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await listUserKeys(userId);

    return NextResponse.json({
      success: true,
      data: {
        keys: keys.map(k => ({
          id: k.id,
          name: k.name,
          key_prefix: k.key_prefix,
          is_active: k.is_active,
          last_used_at: k.last_used_at,
          created_at: k.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('Console keys GET error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, key_id, name } = body as { action?: string; key_id?: string; name?: string };

    if (action === 'regenerate' && key_id) {
      const result = await regenerateApiKey(key_id, userId);
      if (!result) {
        return NextResponse.json({ success: false, error: 'Failed to regenerate key' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        data: { key: result.key, record: result.record, message: 'Key regenerated. Save the new key.' },
      });
    }

    if (action === 'revoke' && key_id) {
      const revoked = await revokeApiKey(key_id, userId);
      if (!revoked) {
        return NextResponse.json({ success: false, error: 'Key not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { message: 'Key revoked' } });
    }

    // Default: create new key
    const result = await createApiKey(userId, name || 'Default');
    if (!result) {
      return NextResponse.json({ success: false, error: 'Failed to create key' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { key: result.key, record: result.record, message: 'Save this key — it won\'t be shown again.' },
    }, { status: 201 });
  } catch (err) {
    console.error('Console keys POST error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
