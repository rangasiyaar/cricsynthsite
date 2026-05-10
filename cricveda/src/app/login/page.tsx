'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/cricveda/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // Store user in localStorage (simplified — production would use JWT/session)
      localStorage.setItem('cs_user', JSON.stringify(data.data.user));
      window.location.href = '/cricveda/console';
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="gradient-orb gradient-orb--purple" style={{ width: 500, height: 500, top: -150, right: -150, position: 'fixed' }} />
      <div style={{ width: '100%', maxWidth: 420, padding: 'var(--spacing-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
          <Link href="/" className="nav__logo" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 'var(--spacing-md)' }}>
            Cric<span>Synthesis</span>
          </Link>
          <h1 className="heading-md">Welcome back</h1>
          <p className="text-small" style={{ marginTop: 'var(--spacing-xs)' }}>
            Sign in to your CricSynthesis account
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="card--flat" style={{
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label className="label" htmlFor="email">Email</label>
            <input
              className="input"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <label className="label" htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
            style={{ width: '100%', marginBottom: 'var(--spacing-lg)' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-small" style={{ textAlign: 'center' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: 'var(--color-accent-secondary)' }}>
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
