import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { insertOne } from '@/lib/db/supabase';
import { createApiKey } from '@/lib/auth/api-key';
import type { User } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body as { email?: string; password?: string; name?: string };

    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await insertOne<User>('users', {
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name: name.trim(),
      plan: 'free',
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Email already registered or signup failed' },
        { status: 409 }
      );
    }

    // Auto-generate first API key
    const keyResult = await createApiKey(user.id, 'Default');

    return NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
        api_key: keyResult ? keyResult.key : null,
        message: keyResult
          ? 'Account created! Save your API key — it won\'t be shown again.'
          : 'Account created! Generate an API key from the console.',
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
