'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/cricveda/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      localStorage.setItem('cs_user', JSON.stringify(data.data.user));

      if (data.data.api_key) {
        setApiKey(data.data.api_key);
      } else {
        window.location.href = '/cricveda/console';
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (apiKey) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 480, padding: 'var(--spacing-xl)', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-lg)' }}>&#127881;</div>
          <h1 className="heading-md" style={{ marginBottom: 'var(--spacing-sm)' }}>Welcome to CricSynthesis!</h1>
          <p className="text-body" style={{ marginBottom: 'var(--spacing-xl)' }}>
            Your API key has been generated. Copy it now — it won&apos;t be shown again.
          </p>

          <div className="code-block" style={{ textAlign: 'left', marginBottom: 'var(--spacing-lg)', wordBreak: 'break-all' }}>
            <pre style={{ color: 'var(--color-success)' }}>{apiKey}</pre>
          </div>

          <button
            className="btn btn--secondary"
            style={{ width: '100%', marginBottom: 'var(--spacing-md)' }}
            onClick={() => navigator.clipboard.writeText(apiKey)}
          >
            Copy API Key
          </button>

          <Link href="/console" className="btn btn--primary" style={{ width: '100%' }}>
            Go to Console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="gradient-orb gradient-orb--purple" style={{ width: 500, height: 500, top: -150, left: -150, position: 'fixed' }} />
      <div style={{ width: '100%', maxWidth: 420, padding: 'var(--spacing-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
          <Link href="/" className="nav__logo" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 'var(--spacing-md)' }}>
            Cric<span>Synthesis</span>
          </Link>
          <h1 className="heading-md">Create your account</h1>
          <p className="text-small" style={{ marginTop: 'var(--spacing-xs)' }}>
            One account for all CricSynthesis products
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              padding: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              fontSize: '0.875rem',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label className="label" htmlFor="name">Name</label>
            <input
              className="input"
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

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
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
            style={{ width: '100%', marginBottom: 'var(--spacing-lg)' }}
          >
            {loading ? 'Creating account...' : 'Create Account & Get API Key'}
          </button>

          <p className="text-small" style={{ textAlign: 'center' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--color-accent-secondary)' }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
