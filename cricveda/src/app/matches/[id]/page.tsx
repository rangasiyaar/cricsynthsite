"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function MatchDetailPage({ params }: { params: { id: string } }) {
  const [insights, setInsights] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch(`/api/v1/matches/${params.id}/insights`);
        const json = await res.json();
        if (json.success) setInsights(json.data);
      } catch {
        console.error('Failed to fetch insights');
      }
      setLoading(false);
    }
    fetchInsights();
  }, [params.id]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
        Loading match insights...
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="container" style={{ padding: '5rem 2rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)' }}>Match not found</h2>
        <Link href="/matches" style={{ marginTop: '1rem', display: 'inline-block' }}>← Back to matches</Link>
      </div>
    );
  }

  const fixture = insights.fixture as Record<string, unknown>;
  const team1 = insights.team1 as Record<string, unknown> | null;
  const team2 = insights.team2 as Record<string, unknown> | null;
  const venue = insights.venue as Record<string, unknown> | null;
  const h2h = insights.head_to_head as Record<string, unknown>;
  const precomputed = insights.precomputed_insights as Record<string, { data: unknown; confidence: number; computed_at: string }>;

  return (
    <>
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/matches">Matches</Link>
              <Link href="/docs">API Docs</Link>
              <Link href="/dashboard" className="nav-cta">Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '2rem 2rem 5rem' }}>
        <Link href="/matches" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'inline-block', marginBottom: '1rem' }}>← Back to matches</Link>

        {/* Match Hero */}
        <div className="card" style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          marginBottom: '1.5rem',
          background: 'linear-gradient(180deg, var(--color-bg-tertiary) 0%, var(--color-bg-glass) 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, background: 'radial-gradient(circle, rgba(99,102,241,0.06), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
              <span className="badge badge-accent">{(fixture.league_id as string)?.toUpperCase()}</span>
              <span className="badge badge-info">{fixture.status as string}</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
              {(team1?.short_name || team1?.name || 'TBD') as string} vs {(team2?.short_name || team2?.name || 'TBD') as string}
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              {venue ? `${(venue.venue_name || venue.name) as string} · ` : ''}
              {fixture.date ? new Date(fixture.date as string).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>
        </div>

        {/* Insights Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
          {/* Venue Intelligence */}
          {venue && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏟️ Venue Intelligence
                <ConfBadge value={venue.confidence as number} />
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <StatBox label="Avg 1st Inn" value={String(venue.avg_1st_innings)} />
                <StatBox label="Avg 2nd Inn" value={String(venue.avg_2nd_innings)} />
                <StatBox label="Pace Wickets" value={`${venue.pace_wicket_pct}%`} />
                <StatBox label="Spin Wickets" value={`${venue.spin_wicket_pct}%`} />
                <StatBox label="Bat First" value={`${venue.toss_bat_first_pct}%`} />
                <StatBox label="Chasing Win" value={`${venue.chasing_win_pct}%`} />
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Based on {venue.matches_analyzed as number} T20 matches at this venue
              </div>
            </div>
          )}

          {/* Head to Head */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>⚔️ Head to Head</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, background: 'var(--color-accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{h2h.team1_wins as number}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{(team1?.short_name || 'Team 1') as string}</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{h2h.total_matches as number}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Total</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-info)' }}>{h2h.team2_wins as number}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{(team2?.short_name || 'Team 2') as string}</div>
              </div>
            </div>
          </div>

          {/* Dream Team */}
          {precomputed?.dream_team && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏆 Dream Team <ConfBadge value={precomputed.dream_team.confidence} />
              </h3>
              <DreamTeamDisplay data={precomputed.dream_team.data as Record<string, unknown>} />
            </div>
          )}

          {/* Captain Picks */}
          {precomputed?.captain_picks && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>👑 Captain Picks</h3>
              <CaptainPicksDisplay data={precomputed.captain_picks.data as Record<string, unknown>[]} />
            </div>
          )}

          {/* Key Battles */}
          {precomputed?.key_battles && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>⚡ Key Battles</h3>
              <KeyBattlesDisplay data={precomputed.key_battles.data as Record<string, unknown>[]} />
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="container">
          <p>© 2026 CricVeda · Data from <a href="https://cricsheet.org">CricSheet</a> (CC BY 4.0) · A <a href="https://cricsynthesis.com">CricSynthesis</a> product</p>
        </div>
      </footer>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, background: 'var(--color-accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value}</div>
      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

function ConfBadge({ value }: { value: number }) {
  const level = value >= 0.85 ? 'very-high' : value >= 0.7 ? 'high' : value >= 0.5 ? 'moderate' : value >= 0.25 ? 'low' : 'very-low';
  return <span className={`confidence-badge confidence-${level}`}>{(value * 100).toFixed(0)}%</span>;
}

function DreamTeamDisplay({ data }: { data: Record<string, unknown> }) {
  const players = (data.players || []) as Record<string, unknown>[];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {players.slice(0, 11).map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.player_name as string}</span>
            <span style={{ marginLeft: '0.5rem', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{(p.role as string).toUpperCase()} · {p.team as string}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--color-accent-secondary)' }}>{p.expected_points as number} pts</span>
        </div>
      ))}
      {data.total_expected_points && (
        <div style={{ textAlign: 'right', marginTop: '0.25rem', fontWeight: 700, color: 'var(--color-warning)' }}>Total: {data.total_expected_points as number} pts</div>
      )}
    </div>
  );
}

function CaptainPicksDisplay({ data }: { data: Record<string, unknown>[] }) {
  const riskColors: Record<string, string> = { safe: 'var(--color-success)', moderate: 'var(--color-warning)', risky: 'var(--color-danger)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {data.map((pick, i) => (
        <div key={i} style={{ padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>#{pick.rank as number} {pick.player_name as string}</span>
            <span style={{ color: riskColors[(pick.risk_level as string)] || 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{(pick.risk_level as string).toUpperCase()}</span>
          </div>
          {(pick.reasoning as string[])?.map((r, j) => (
            <div key={j} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', paddingLeft: '0.5rem' }}>• {r}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function KeyBattlesDisplay({ data }: { data: Record<string, unknown>[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.slice(0, 5).map((battle, i) => (
        <div key={i} style={{ padding: '0.625rem 0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            {battle.batter_name as string} vs {battle.bowler_name as string}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {battle.balls as number} balls · SR {battle.strike_rate as number} · {battle.dismissals as number} dismissals ·
            <span style={{ color: (battle.advantage as string) === 'batter' ? 'var(--color-success)' : (battle.advantage as string) === 'bowler' ? 'var(--color-danger)' : 'var(--color-text-muted)', fontWeight: 600 }}>
              {' '}{(battle.advantage as string).toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
