'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ConsoleOverviewPage() {
  const [user, setUser] = useState<{ name: string; plan: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cs_user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h1 className="heading-lg" style={{ marginBottom: 'var(--spacing-xs)' }}>
          Welcome back{user ? `, ${user.name}` : ''}
        </h1>
        <p className="text-body">Your CricSynthesis developer console.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid--4" style={{ marginBottom: 'var(--spacing-2xl)' }}>
        {[
          { label: 'Plan', value: user?.plan || 'free', accent: true },
          { label: 'API Calls Today', value: '—' },
          { label: 'Active Keys', value: '—' },
          { label: 'Avg Latency', value: '<200ms' },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <div className={`metric-card__value ${m.accent ? 'text-gradient' : ''}`} style={{ fontSize: '1.5rem', textTransform: 'capitalize' }}>
              {m.value}
            </div>
            <div className="metric-card__label">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>Quick Actions</h2>
        <div className="grid grid--3">
          <Link href="/console/keys" className="card" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-sm)' }}>🔑</div>
            <div className="heading-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>Manage API Keys</div>
            <p className="text-small">Create, revoke, or regenerate your cs_ API keys.</p>
          </Link>
          <Link href="/console/docs" className="card" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-sm)' }}>📖</div>
            <div className="heading-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>API Documentation</div>
            <p className="text-small">Full endpoint reference with examples and response schemas.</p>
          </Link>
          <Link href="/console/usage" className="card" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-sm)' }}>📈</div>
            <div className="heading-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>View Usage</div>
            <p className="text-small">Track API calls, error rates, and usage patterns.</p>
          </Link>
        </div>
      </div>

      {/* Active Products */}
      <div>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>Your Products</h2>
        <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <div style={{ fontSize: '1.5rem' }}>🏏</div>
              <div>
                <div className="heading-sm">CricVeda API</div>
                <p className="text-small">Fantasy Cricket Intelligence — 13+ T20 leagues</p>
              </div>
            </div>
            <span className="badge badge--success">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
