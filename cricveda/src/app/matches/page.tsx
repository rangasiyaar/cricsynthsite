"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

interface FixtureItem {
  id: number;
  date: string;
  time: string | null;
  league_id: string;
  status: string;
  insights_ready: boolean;
  team1: { name: string; short_name: string } | null;
  team2: { name: string; short_name: string } | null;
  venue: { name: string; city: string } | null;
}

const leagues = [
  { id: 'all', name: 'All Leagues' },
  { id: 'ipl', name: 'IPL' },
  { id: 't20i', name: 'T20 International' },
  { id: 'bbl', name: 'BBL' },
  { id: 'psl', name: 'PSL' },
  { id: 'cpl', name: 'CPL' },
  { id: 'hundred', name: 'The Hundred' },
  { id: 'sa20', name: 'SA20' },
];

export default function MatchesPage() {
  const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState('all');

  useEffect(() => {
    async function fetchMatches() {
      setLoading(true);
      try {
        const url = league === 'all'
          ? '/api/v1/matches?status=upcoming'
          : `/api/v1/matches?status=upcoming&league=${league}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) {
          setFixtures(json.data.items);
        }
      } catch {
        console.error('Failed to fetch matches');
      }
      setLoading(false);
    }
    fetchMatches();
  }, [league]);

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/matches" style={{ color: 'var(--color-text-primary)' }}>Matches</Link>
              <Link href="/docs">API Docs</Link>
              <Link href="/dashboard" className="nav-cta">Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '3rem 2rem 5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <span className="section-label" style={{ marginBottom: '1rem' }}>T20 Cricket</span>
          <h1 className="section-title" style={{ marginBottom: '0.5rem' }}>Upcoming Matches</h1>
          <p className="section-description" style={{ maxWidth: 600 }}>
            T20 matches across all leagues with pre-computed fantasy insights, dream team recommendations, and key battles.
          </p>
        </div>

        {/* League filter pills */}
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {leagues.map(l => (
            <button
              key={l.id}
              onClick={() => setLeague(l.id)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${league === l.id ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                background: league === l.id ? 'var(--color-accent-glow)' : 'transparent',
                color: league === l.id ? 'var(--color-accent-secondary)' : 'var(--color-text-tertiary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-primary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Match cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--color-text-muted)' }}>
            <p style={{ fontSize: '1.125rem' }}>Loading matches...</p>
          </div>
        ) : fixtures.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--color-text-muted)' }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No upcoming matches</p>
            <p style={{ fontSize: '0.875rem' }}>Check back when a T20 league is in progress!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {fixtures.map(fixture => (
              <Link key={fixture.id} href={`/matches/${fixture.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: '1rem',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span className="badge badge-accent" style={{ fontSize: '0.625rem' }}>
                        {fixture.league_id.toUpperCase()}
                      </span>
                      {fixture.status === 'live' && (
                        <span className="badge badge-danger" style={{ fontSize: '0.625rem' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-danger)', display: 'inline-block', marginRight: 4, animation: 'pulse 2s infinite' }} />
                          LIVE
                        </span>
                      )}
                      {fixture.insights_ready && (
                        <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>Insights Ready</span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '-0.01em' }}>
                      {fixture.team1?.short_name || fixture.team1?.name || 'TBD'} vs {fixture.team2?.short_name || fixture.team2?.name || 'TBD'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {fixture.venue?.name}{fixture.venue?.city ? `, ${fixture.venue.city}` : ''} · {new Date(fixture.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {fixture.time ? ` · ${fixture.time}` : ''}
                    </div>
                  </div>
                  <div style={{ color: 'var(--color-accent-secondary)', fontSize: '1.25rem' }}>→</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <footer className="footer">
        <div className="container">
          <div className="footer-links">
            <Link href="/docs">API Docs</Link>
            <Link href="/dashboard">Dashboard</Link>
            <a href="https://cricsynthesis.com">CricSynthesis</a>
          </div>
          <p>© 2026 CricVeda · Data from <a href="https://cricsheet.org">CricSheet</a> (CC BY 4.0)</p>
        </div>
      </footer>
    </>
  );
}
