import { NextRequest, NextResponse } from 'next/server';
import { createApiKey, listUserKeys, revokeApiKey, regenerateApiKey } from '@/lib/auth/api-key';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await listUserKeys(userId);
    return NextResponse.json({ success: true, data: { keys } });
  } catch (err) {
    console.error('List API keys error:', err);
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
    const name = (body as { name?: string }).name || 'Default';

    const result = await createApiKey(userId, name);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Failed to create API key' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        key: result.key,
        record: result.record,
        message: 'Save this key — it won\'t be shown again.',
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Create API key error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const keyId = url.searchParams.get('key_id');

    if (!keyId) {
      return NextResponse.json({ success: false, error: 'key_id is required' }, { status: 400 });
    }

    const revoked = await revokeApiKey(keyId, userId);
    if (!revoked) {
      return NextResponse.json({ success: false, error: 'Key not found or already revoked' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { message: 'API key revoked' } });
  } catch (err) {
    console.error('Revoke API key error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
