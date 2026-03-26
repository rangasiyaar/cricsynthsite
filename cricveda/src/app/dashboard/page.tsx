"use client";
import React, { useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'api-key' | 'usage'>('overview');

  // Demo data (would come from auth session)
  const userData = {
    name: 'Saurav Kumar',
    email: 'saurav@cricsynthesis.com',
    plan: 'Free',
    apiKey: 'cv_a4f7••••••••••••••••••••••••••',
    dailyLimit: 100,
    usedToday: 23,
    totalCalls: 847,
    memberSince: 'March 2026',
  };

  return (
    <>
      {/* NAVIGATION */}
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/matches">Matches</Link>
              <Link href="/docs">API Docs</Link>
              <Link href="/dashboard" style={{ color: 'var(--color-text-primary)' }}>Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '3rem 2rem 5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Dashboard
            </h1>
            <span className="badge badge-accent">{userData.plan}</span>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
            Manage your API keys, monitor usage, and explore CricVeda analytics.
          </p>
        </div>

        {/* Tab navigation */}
        <div style={{
          display: 'flex', gap: '0.25rem',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.375rem',
          marginBottom: '2rem',
          width: 'fit-content',
        }}>
          {(['overview', 'api-key', 'usage'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeTab === tab ? 'var(--color-bg-glass)' : 'transparent',
                color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                fontFamily: 'var(--font-primary)',
                cursor: 'pointer',
                transition: 'all 150ms',
                boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
                letterSpacing: '-0.01em',
              }}
            >
              {tab === 'overview' ? 'Overview' : tab === 'api-key' ? 'API Key' : 'Usage'}
            </button>
          ))}
        </div>

        {/* TAB: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Metrics */}
            <div className="metrics-row">
              <div className="metric-card">
                <div className="metric-value">{userData.usedToday}</div>
                <div className="metric-label">Calls Today</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{userData.dailyLimit}</div>
                <div className="metric-label">Daily Limit</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{userData.totalCalls}</div>
                <div className="metric-label">Total Calls</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{Math.round((userData.usedToday / userData.dailyLimit) * 100)}%</div>
                <div className="metric-label">Limit Used</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <QuickAction
                href="/matches"
                icon="🏏"
                title="Browse Matches"
                desc="View upcoming T20 matches with pre-computed fantasy insights and dream team recommendations."
              />
              <QuickAction
                href="/docs"
                icon="📄"
                title="API Documentation"
                desc="Comprehensive docs for all 18 endpoints. Includes examples, error codes, and rate limit details."
              />
              <QuickAction
                href="/playground"
                icon="🧪"
                title="API Playground"
                desc="Test endpoints live with your API key. Try form scores, matchups, and dream team generation."
              />
            </div>

            {/* Account Info */}
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', letterSpacing: '-0.01em' }}>Account</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <InfoRow label="Email" value={userData.email} />
                <InfoRow label="Plan" value={userData.plan} />
                <InfoRow label="Member Since" value={userData.memberSince} />
                <InfoRow label="API Version" value="v1" />
              </div>
            </div>
          </div>
        )}

        {/* TAB: API Key */}
        {activeTab === 'api-key' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 640 }}>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Your API Key</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1.5rem' }}>
                Use this key in the <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>Authorization: Bearer</code> header.
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem',
              }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--color-accent-secondary)', flex: 1 }}>
                  {userData.apiKey}
                </code>
                <button className="btn btn-outline" style={{ padding: '0.375rem 0.875rem', fontSize: '0.75rem' }}>
                  Copy
                </button>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Quick Start</h3>
              <div className="code-block" style={{ marginTop: '1rem' }}>
                <div style={{ color: 'var(--color-text-muted)' }}># Get a player&apos;s form score</div>
                <div style={{ color: 'var(--color-accent-secondary)' }}>curl -H &quot;Authorization: Bearer YOUR_KEY&quot; \</div>
                <div style={{ color: 'var(--color-accent-secondary)', paddingLeft: '2rem' }}>https://cricveda.com/api/v1/players/42/form</div>
              </div>
            </div>

            <div className="card" style={{ borderColor: 'var(--color-danger-bg)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-danger)' }}>Danger Zone</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>
                Regenerating your API key will invalidate the current one immediately.
              </p>
              <button className="btn" style={{
                background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}>
                Regenerate API Key
              </button>
            </div>
          </div>
        )}

        {/* TAB: Usage */}
        {activeTab === 'usage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="metrics-row">
              <div className="metric-card">
                <div className="metric-value">{userData.usedToday}/{userData.dailyLimit}</div>
                <div className="metric-label">Today&apos;s Usage</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{userData.totalCalls}</div>
                <div className="metric-label">All-Time Calls</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">143ms</div>
                <div className="metric-label">Avg Latency</div>
              </div>
            </div>

            {/* Usage breakdown */}
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Endpoint Usage (Today)</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Calls</th>
                      <th>Avg Latency</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    <UsageRow endpoint="/api/v1/players/[id]/form" calls={8} latency="120ms" errors={0} />
                    <UsageRow endpoint="/api/v1/matches" calls={5} latency="95ms" errors={0} />
                    <UsageRow endpoint="/api/v1/matchups/batter-vs-bowler" calls={4} latency="180ms" errors={0} />
                    <UsageRow endpoint="/api/v1/venues/[id]" calls={3} latency="110ms" errors={0} />
                    <UsageRow endpoint="/api/v1/fantasy/[id]/dream-team" calls={2} latency="220ms" errors={0} />
                    <UsageRow endpoint="/api/v1/players" calls={1} latency="85ms" errors={0} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upgrade CTA */}
            <div className="card" style={{ borderColor: 'var(--color-border-accent)', textAlign: 'center', padding: '2rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Need More?</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
                Upgrade to Pro for 5,000 API calls/day, Dream Team, Captain Picks, and priority support.
              </p>
              <button className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                Upgrade to Pro — $9/mo
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="footer">
        <div className="container">
          <div className="footer-links">
            <Link href="/docs">API Docs</Link>
            <Link href="/matches">Matches</Link>
            <a href="https://cricsynthesis.com">CricSynthesis</a>
          </div>
          <p>© 2026 CricVeda · A CricSynthesis Product</p>
        </div>
      </footer>
    </>
  );
}

function QuickAction({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', cursor: 'pointer' }}>
        <div style={{ fontSize: '1.75rem' }}>{icon}</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{desc}</p>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-accent-secondary)', fontWeight: 600, marginTop: 'auto' }}>
          Explore →
        </span>
      </div>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>{value}</div>
    </div>
  );
}

function UsageRow({ endpoint, calls, latency, errors }: { endpoint: string; calls: number; latency: string; errors: number }) {
  return (
    <tr>
      <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-accent-secondary)' }}>{endpoint}</code></td>
      <td>{calls}</td>
      <td>{latency}</td>
      <td style={{ color: errors > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{errors}</td>
    </tr>
  );
}
