"use client";
import React from "react";
import Link from "next/link";

export default function LandingPage() {
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
              <Link href="/playground">Playground</Link>
              <Link href="/dashboard" className="nav-cta">Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(80px + 6rem) 2rem 4rem',
        overflow: 'hidden',
      }}>
        {/* Background orbs */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
          }} />
        </div>

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 800, textAlign: 'center' }}>
          <div className="animate-in-1" style={{ marginBottom: '1.5rem' }}>
            <span className="section-label" style={{ marginBottom: 0 }}>
              <span style={{ width: 8, height: 8, background: 'var(--color-success)', borderRadius: '50%', boxShadow: '0 0 8px rgba(16,185,129,0.5)', animation: 'pulse 2s ease-in-out infinite' }} />
              <span>API v1 — Now Available</span>
            </span>
          </div>
          <h1 className="animate-in-2" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.75rem, 6.5vw, 5rem)',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            marginBottom: '1.5rem',
          }}>
            Fantasy Cricket Intelligence{' '}
            <span style={{
              background: 'var(--color-accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Powered by Data
            </span>
          </h1>
          <p className="animate-in-3" style={{
            fontSize: '1.1875rem',
            color: 'var(--color-text-secondary)',
            maxWidth: 580,
            margin: '0 auto 3rem',
            lineHeight: 1.75,
          }}>
            Deep ball-by-ball analytics across every T20 league globally.
            Cross-league form scores, matchup analysis, dream team generation, and captain picks — all via API.
          </p>
          <div className="animate-in-4" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard" className="btn btn-primary" style={{ padding: '0.875rem 2rem', fontSize: '0.9375rem' }}>
              Get Free API Key →
            </Link>
            <Link href="/docs" className="btn btn-outline" style={{ padding: '0.875rem 2rem', fontSize: '0.9375rem' }}>
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      {/* KEY METRICS */}
      <section style={{ padding: '0 0 4rem' }}>
        <div className="container">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3rem',
            padding: '2rem 3rem',
            background: 'var(--color-bg-glass)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)', backdropFilter: 'blur(16px)',
            maxWidth: 700, margin: '0 auto',
          }}>
            <MetricBlock value="4,500+" label="T20 Matches" />
            <div style={{ width: 1, height: 44, background: 'linear-gradient(to bottom, transparent, var(--color-border), transparent)' }} />
            <MetricBlock value="13" label="T20 Leagues" />
            <div style={{ width: 1, height: 44, background: 'linear-gradient(to bottom, transparent, var(--color-border), transparent)' }} />
            <MetricBlock value="18" label="API Endpoints" />
            <div style={{ width: 1, height: 44, background: 'linear-gradient(to bottom, transparent, var(--color-border), transparent)' }} />
            <MetricBlock value="$0" label="Free Tier" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 0', background: 'var(--color-bg-secondary)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 1, background: 'linear-gradient(to right, transparent, var(--color-border-accent), transparent)' }} />
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 4rem' }}>
            <span className="section-label">Core Features</span>
            <h2 className="section-title">What CricVeda Does</h2>
            <p className="section-description">
              Every feature is designed for fantasy cricket users who demand data-backed precision.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <FeatureCard icon="🧠" title="Cross-League Form Scores" desc="Virat Kohli's form isn't just IPL 2024 — it includes his T20I, BBL, and SA20 performances. We weight ALL T20 data to compute a single, accurate form score." />
            <FeatureCard icon="⚔️" title="Batter vs Bowler Matchups" desc="Ball-by-ball H2H analysis across every league they've played. SR, dot %, dismissals, phase-wise breakdown — all with confidence scoring." />
            <FeatureCard icon="🏟️" title="Venue Intelligence" desc="Average scores, pace vs spin split, toss advantage, chasing win %, and phase-wise breakdown for every T20 venue with 5+ matches." />
            <FeatureCard icon="🏆" title="Dream Team Generator" desc="Optimal fantasy XI with all Dream11 constraints (1-4 WK, 3-6 BAT, 1-4 AR, 3-6 BOWL). Every pick has specific, data-backed reasoning." />
            <FeatureCard icon="👑" title="Captain Picker" desc="Top 3 captain recommendations with weighted scoring: form (35%), venue history (25%), matchups (20%), consistency (10%), role ceiling (10%)." />
            <FeatureCard icon="🎯" title="Confidence Scoring" desc="Every data point has a confidence score between 0 and 1. You see exactly how much data backs each recommendation. No black boxes." />
          </div>
        </div>
      </section>

      {/* API PREVIEW */}
      <section style={{ padding: '5rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 3rem' }}>
            <span className="section-label">Developer Experience</span>
            <h2 className="section-title">Developer-First Design</h2>
            <p className="section-description">RESTful JSON API with everything you need to build fantasy intelligence into your app.</p>
          </div>
          <div className="code-block" style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>// Get player form score across all T20 leagues</div>
            <div><span style={{ color: 'var(--color-accent-tertiary)' }}>GET</span> <span style={{ color: 'var(--color-accent-secondary)' }}>/api/v1/players/42/form</span></div>
            <br />
            <div style={{ color: 'var(--color-text-muted)' }}>{'{'}</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;player_name&quot;</span>: <span style={{ color: 'var(--color-success)' }}>&quot;Suryakumar Yadav&quot;</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;score&quot;</span>: <span style={{ color: 'var(--color-info)' }}>8.42</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;trend&quot;</span>: <span style={{ color: 'var(--color-success)' }}>&quot;improving&quot;</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;confidence&quot;</span>: <span style={{ color: 'var(--color-info)' }}>0.91</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;leagues_used&quot;</span>: [<span style={{ color: 'var(--color-success)' }}>&quot;ipl&quot;</span>, <span style={{ color: 'var(--color-success)' }}>&quot;t20i&quot;</span>, <span style={{ color: 'var(--color-success)' }}>&quot;sa20&quot;</span>],</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#fbbf24' }}>&quot;matches_used&quot;</span>: <span style={{ color: 'var(--color-info)' }}>18</span></div>
            <div style={{ color: 'var(--color-text-muted)' }}>{'}'}</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '5rem 0', background: 'var(--color-bg-secondary)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 1, background: 'linear-gradient(to right, transparent, var(--color-border-accent), transparent)' }} />
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 3rem' }}>
            <span className="section-label">Pricing</span>
            <h2 className="section-title">Simple, Transparent Pricing</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', maxWidth: 700, margin: '0 auto' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Free</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, marginBottom: 4 }}>$0</div>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: '0.875rem' }}>per month, forever</div>
              <ul style={{ listStyle: 'none', textAlign: 'left', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {['100 API calls/day', 'Player form scores', 'Match insights', 'Venue intelligence', 'Top 3 matchups'].map(f => (
                  <li key={f} style={{ padding: '0.375rem 0' }}>✓ {f}</li>
                ))}
                {['Dream team generator', 'Captain picks'].map(f => (
                  <li key={f} style={{ padding: '0.375rem 0', color: 'var(--color-text-muted)' }}>✗ {f}</li>
                ))}
              </ul>
              <Link href="/dashboard" className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }}>Get Started Free</Link>
            </div>
            <div className="card" style={{ textAlign: 'center', borderColor: 'var(--color-accent-primary)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pro</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, marginBottom: 4 }}>$9</div>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: '0.875rem' }}>per month</div>
              <ul style={{ listStyle: 'none', textAlign: 'left', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {['5,000 API calls/day', 'Everything in Free', 'Full matchup data', 'Dream team generator', 'Captain picks + anti-pick', 'Differential finder', 'Priority support'].map(f => (
                  <li key={f} style={{ padding: '0.375rem 0' }}>✓ {f}</li>
                ))}
              </ul>
              <Link href="/dashboard" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }}>Upgrade to Pro</Link>
            </div>
          </div>
        </div>
      </section>

      {/* DATA ATTRIBUTION */}
      <section style={{ padding: '2.5rem 0', background: 'var(--color-bg-tertiary)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
            Ball-by-ball data sourced from <a href="https://cricsheet.org" target="_blank" rel="noopener noreferrer">CricSheet</a> (CC BY 4.0).
            Player metadata from <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0).
            A <a href="https://cricsynthesis.com">CricSynthesis</a> product.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-links">
            <Link href="/docs">API Docs</Link>
            <Link href="/playground">Playground</Link>
            <Link href="/matches">Matches</Link>
            <a href="https://cricsynthesis.com">CricSynthesis</a>
          </div>
          <p>© 2026 CricVeda · A CricSynthesis Product</p>
        </div>
      </footer>
    </>
  );
}

function MetricBlock({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{desc}</p>
    </div>
  );
}
