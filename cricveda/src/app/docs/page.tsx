"use client";
import React, { useState } from "react";
import Link from "next/link";

const endpoints = [
  {
    group: 'Players',
    items: [
      { method: 'GET', path: '/api/v1/players', desc: 'List players with search, role, and country filters', auth: false, params: ['search', 'role', 'country', 'page', 'per_page'] },
      { method: 'GET', path: '/api/v1/players/:id', desc: 'Get player profile with details', auth: false, params: ['id'] },
      { method: 'GET', path: '/api/v1/players/:id/form', desc: 'Cross-league form score (0-10)', auth: false, params: ['id', 'type'] },
    ]
  },
  {
    group: 'Matches',
    items: [
      { method: 'GET', path: '/api/v1/matches', desc: 'List upcoming and recent matches', auth: false, params: ['league', 'status', 'page', 'per_page'] },
      { method: 'GET', path: '/api/v1/matches/:id/insights', desc: 'Match insights: venue, H2H, precomputed analytics', auth: false, params: ['id'] },
    ]
  },
  {
    group: 'Matchups',
    items: [
      { method: 'GET', path: '/api/v1/matchups/batter-vs-bowler', desc: 'H2H stats with phase breakdown and fantasy note', auth: false, params: ['batter_id', 'bowler_id'] },
      { method: 'GET', path: '/api/v1/matchups/key-battles/:match_id', desc: 'Top key battles for an upcoming match', auth: true, params: ['match_id', 'limit'] },
    ]
  },
  {
    group: 'Venues',
    items: [
      { method: 'GET', path: '/api/v1/venues/:id', desc: 'Venue intelligence: avg scores, pace/spin split, trends', auth: false, params: ['id'] },
    ]
  },
  {
    group: 'Fantasy',
    items: [
      { method: 'GET', path: '/api/v1/fantasy/:match_id/dream-team', desc: 'Optimal fantasy XI with constraint solving', auth: true, params: ['match_id'] },
      { method: 'GET', path: '/api/v1/fantasy/:match_id/captain-picks', desc: 'Top 3 captain recommendations with risk levels', auth: true, params: ['match_id'] },
      { method: 'GET', path: '/api/v1/fantasy/:match_id/differentials', desc: 'Under-the-radar differential picks', auth: true, params: ['match_id', 'limit'] },
    ]
  },
  {
    group: 'Auth',
    items: [
      { method: 'POST', path: '/api/auth/signup', desc: 'Create account and receive API key', auth: false, params: ['email', 'password', 'name'] },
      { method: 'GET', path: '/api/v1/health', desc: 'API health check', auth: false, params: [] },
    ]
  },
];

export default function DocsPage() {
  const [activeGroup, setActiveGroup] = useState('Players');

  return (
    <>
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/matches">Matches</Link>
              <Link href="/docs" style={{ color: 'var(--color-text-primary)' }}>API Docs</Link>
              <Link href="/dashboard" className="nav-cta">Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <span className="section-label" style={{ marginBottom: '1rem' }}>API v1</span>
          <h1 className="section-title">API Documentation</h1>
          <p className="section-description" style={{ maxWidth: 600 }}>
            Complete reference for all CricVeda endpoints. Base URL: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.8125rem' }}>https://cricveda.com/api/v1</code>
          </p>
        </div>

        {/* Auth info */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem' }}>Authentication</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Include your API key in the <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>Authorization</code> header:
          </p>
          <div className="code-block">
            Authorization: Bearer cv_your_api_key_here
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-success">FREE</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>Optional auth, 100 calls/day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-warning">PRO</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>Required auth, 5K calls/day</span>
            </div>
          </div>
        </div>

        {/* Sidebar + content */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem' }}>
          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {endpoints.map(group => (
              <button key={group.group} onClick={() => setActiveGroup(group.group)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: 'none', textAlign: 'left',
                  background: activeGroup === group.group ? 'var(--color-accent-glow)' : 'transparent',
                  color: activeGroup === group.group ? 'var(--color-accent-secondary)' : 'var(--color-text-tertiary)',
                  fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-primary)', cursor: 'pointer',
                }}>
                {group.group}
                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({group.items.length})</span>
              </button>
            ))}
          </div>

          {/* Endpoint list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {endpoints.find(g => g.group === activeGroup)?.items.map((ep, i) => (
              <div key={i} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 700,
                    padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)',
                    background: ep.method === 'GET' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                    color: ep.method === 'GET' ? 'var(--color-success)' : 'var(--color-accent-secondary)',
                  }}>{ep.method}</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{ep.path}</code>
                  {ep.auth && <span className="badge badge-warning" style={{ fontSize: '0.5625rem' }}>PRO</span>}
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>{ep.desc}</p>
                {ep.params.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {ep.params.map(p => (
                      <span key={p} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border-subtle)',
                      }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Response envelope */}
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem' }}>Response Envelope</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            All endpoints return a consistent JSON envelope:
          </p>
          <div className="code-block">
            <div style={{ color: 'var(--color-text-muted)' }}>{'{'}</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;success&quot;</span>: <span style={{ color: 'var(--color-success)' }}>true</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;data&quot;</span>: {'{ ... }'},</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;meta&quot;</span>: {'{'}</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;timestamp&quot;</span>: <span style={{ color: 'var(--color-success)' }}>&quot;2026-03-26T...&quot;</span>,</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;cached&quot;</span>: <span style={{ color: 'var(--color-info)' }}>false</span>,</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;api_version&quot;</span>: <span style={{ color: 'var(--color-success)' }}>&quot;v1&quot;</span></div>
            <div>&nbsp;&nbsp;{'}'}</div>
            <div style={{ color: 'var(--color-text-muted)' }}>{'}'}</div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <p>© 2026 CricVeda · A <a href="https://cricsynthesis.com">CricSynthesis</a> Product</p>
        </div>
      </footer>
    </>
  );
}
