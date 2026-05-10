'use client';

import Link from 'next/link';

const ENDPOINTS = [
  { method: 'GET', path: '/players', desc: 'List all players with filtering', auth: false },
  { method: 'GET', path: '/players/:id', desc: 'Player profile with career stats', auth: false },
  { method: 'GET', path: '/players/:id/form', desc: 'Cross-league form score (0–10)', auth: false },
  { method: 'GET', path: '/matches', desc: 'Upcoming fixtures with filters', auth: false },
  { method: 'GET', path: '/matches/:id/insights', desc: 'Pre-computed match insights', auth: false },
  { method: 'GET', path: '/matches/:id/recommendations', desc: 'Dream team + captains + differentials', auth: true },
  { method: 'GET', path: '/matchups/batter-vs-bowler', desc: 'Head-to-head with phase breakdown', auth: true },
  { method: 'GET', path: '/matchups/key-battles/:id', desc: 'Top 5 key battles for a match', auth: true },
  { method: 'GET', path: '/fantasy/:id/dream-team', desc: 'AI-generated Dream11 team', auth: true },
  { method: 'GET', path: '/fantasy/:id/captain-picks', desc: 'Captain & VC recommendations', auth: true },
  { method: 'GET', path: '/venues/:id', desc: 'Venue intelligence report', auth: true },
  { method: 'GET', path: '/predictions/:id', desc: 'Win probability predictions', auth: true },
  { method: 'GET', path: '/leaderboards', desc: 'Form, fantasy, consistency rankings', auth: false },
];

const LEAGUES = [
  'IPL', 'T20I', 'BBL', 'PSL', 'CPL', 'The Hundred',
  'SA20', 'LPL', 'BPL', 'ILT20', 'MLC', 'SMAT', 'Blast',
];

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    features: ['100 API calls/day', 'Player profiles & form scores', 'Match listings', 'Leaderboards', 'Community support'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    features: ['5,000 API calls/day', 'All Free endpoints', 'Dream team generator', 'Captain & differential picks', 'Matchup analysis', 'Venue intelligence', 'Priority support'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['50,000+ API calls/day', 'All Pro endpoints', 'Win probability predictions', 'Dedicated support', 'Custom SLA', 'Webhook notifications', 'White-label options'],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export default function CricVedaProductPage() {
  return (
    <>
      {/* Nav */}
      <nav className="nav">
        <Link href="/" className="nav__logo">
          Cric<span>Synthesis</span>
        </Link>
        <ul className="nav__links">
          <li><a href="#features" className="nav__link">Features</a></li>
          <li><a href="#endpoints" className="nav__link">API</a></li>
          <li><a href="#pricing" className="nav__link">Pricing</a></li>
          <li><Link href="/login" className="nav__link">Log In</Link></li>
          <li><Link href="/signup" className="btn btn--primary btn--sm">Get API Key</Link></li>
        </ul>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', padding: 'var(--spacing-4xl) 0', overflow: 'hidden' }}>
        <div className="gradient-orb gradient-orb--purple" style={{ width: 600, height: 600, top: -200, right: -200 }} />
        <div className="gradient-orb gradient-orb--cyan" style={{ width: 400, height: 400, bottom: -100, left: -100 }} />
        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div className="badge badge--accent" style={{ marginBottom: 'var(--spacing-lg)' }}>
            Powered by CricSynthesis
          </div>
          <h1 className="heading-xl" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <span className="text-gradient">CricVeda</span> — Fantasy Cricket
            <br />Intelligence API
          </h1>
          <p className="text-body" style={{ maxWidth: 640, margin: '0 auto var(--spacing-2xl)', fontSize: '1.125rem' }}>
            AI-powered analytics across 13+ T20 leagues. Form scores, matchup analysis,
            dream teams, venue intelligence — all with confidence scores.
          </p>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn btn--primary btn--lg">
              Get Free API Key
            </Link>
            <a href="#endpoints" className="btn btn--secondary btn--lg">
              Explore Endpoints
            </a>
          </div>

          {/* API Preview */}
          <div className="code-block" style={{ maxWidth: 640, margin: 'var(--spacing-2xl) auto 0', textAlign: 'left' }}>
            <pre>
              <span className="comment">{'// Get Virat Kohli\'s cross-league form score'}</span>{'\n'}
              <span className="keyword">GET</span> /api/v1/players/123/form{'\n'}
              <span className="keyword">Authorization:</span> Bearer cs_a4f7c2e1...{'\n\n'}
              <span className="comment">{'// Response'}</span>{'\n'}
              {'{'}{'\n'}
              {'  '}<span className="string">"score"</span>: <span className="number">8.45</span>,{'\n'}
              {'  '}<span className="string">"trend"</span>: <span className="string">"improving"</span>,{'\n'}
              {'  '}<span className="string">"confidence"</span>: {'{ '}
              <span className="string">"score"</span>: <span className="number">0.87</span>,{' '}
              <span className="string">"tier"</span>: <span className="string">"very_high"</span>
              {' }'},{'\n'}
              {'  '}<span className="string">"matches_used"</span>: <span className="number">18</span>,{'\n'}
              {'  '}<span className="string">"leagues"</span>: [<span className="string">"ipl"</span>, <span className="string">"t20i"</span>, <span className="string">"sa20"</span>]{'\n'}
              {'}'}
            </pre>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section style={{ padding: 'var(--spacing-2xl) 0' }}>
        <div className="container">
          <div className="grid grid--4">
            {[
              { value: '13+', label: 'T20 Leagues' },
              { value: '18+', label: 'API Endpoints' },
              { value: '<200ms', label: 'Avg Response' },
              { value: '99.9%', label: 'Uptime SLA' },
            ].map((m) => (
              <div className="metric-card" key={m.label}>
                <div className="metric-card__value text-gradient">{m.value}</div>
                <div className="metric-card__label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="container">
          <div className="section__header" style={{ textAlign: 'center' }}>
            <h2 className="heading-lg" style={{ marginBottom: 'var(--spacing-sm)' }}>
              Intelligence That Wins
            </h2>
            <p className="text-body">Everything you need to build winning fantasy cricket products.</p>
          </div>
          <div className="grid grid--3">
            {[
              {
                icon: '📊',
                title: 'Cross-League Form Scores',
                desc: 'Decay-weighted 0–10 scores spanning IPL, BBL, T20I, PSL and more. Updated after every match.',
              },
              {
                icon: '⚔️',
                title: 'Batter vs Bowler Matchups',
                desc: 'H2H stats with phase breakdown (powerplay, middle, death), advantage indicator, and fantasy notes.',
              },
              {
                icon: '🏟️',
                title: 'Venue Intelligence',
                desc: 'Pace vs spin split, avg scores by innings, chasing win %, and phase-wise run rates per venue.',
              },
              {
                icon: '🏆',
                title: 'AI Dream Teams',
                desc: 'Dream11-compliant 11-player squads with captain/VC picks, respecting all team composition rules.',
              },
              {
                icon: '🎯',
                title: 'Captain Picks',
                desc: 'Ranked captain recommendations with risk levels (safe/moderate/risky) and reasoning chains.',
              },
              {
                icon: '📈',
                title: 'Confidence Scoring',
                desc: 'Every analytical output carries a 0–1 confidence score based on data depth, recency, and coverage.',
              },
            ].map((f) => (
              <div className="card" key={f.title}>
                <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-md)' }}>{f.icon}</div>
                <h3 className="heading-sm" style={{ marginBottom: 'var(--spacing-sm)' }}>{f.title}</h3>
                <p className="text-small">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Leagues */}
      <section style={{ padding: 'var(--spacing-2xl) 0', borderTop: '1px solid var(--color-border)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="text-small" style={{ marginBottom: 'var(--spacing-lg)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Covering all major T20 leagues
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
            {LEAGUES.map((l) => (
              <span className="badge badge--accent" key={l}>{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Endpoint Reference */}
      <section id="endpoints" className="section" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <div className="section__header" style={{ textAlign: 'center' }}>
            <h2 className="heading-lg" style={{ marginBottom: 'var(--spacing-sm)' }}>
              API Endpoint Reference
            </h2>
            <p className="text-body">
              Base URL: <code className="text-mono" style={{ color: 'var(--color-accent-secondary)' }}>
                https://cricsynthesis.in/cricveda/api/v1
              </code>
            </p>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Description</th>
                  <th>Auth</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((ep) => (
                  <tr key={ep.path}>
                    <td>
                      <span className="badge badge--accent" style={{ fontFamily: 'var(--font-mono)' }}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="text-mono" style={{ color: 'var(--color-text-primary)' }}>{ep.path}</td>
                    <td>{ep.desc}</td>
                    <td>
                      {ep.auth ? (
                        <span className="badge badge--warning">Required</span>
                      ) : (
                        <span className="badge badge--success">Optional</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="section" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <div className="section__header" style={{ textAlign: 'center' }}>
            <h2 className="heading-lg" style={{ marginBottom: 'var(--spacing-sm)' }}>
              Simple, Transparent Pricing
            </h2>
            <p className="text-body">One API key for all CricSynthesis products. Pay only for what you use.</p>
          </div>
          <div className="grid grid--3" style={{ maxWidth: 960, margin: '0 auto' }}>
            {PRICING.map((plan) => (
              <div
                className="card"
                key={plan.name}
                style={{
                  borderColor: plan.highlight ? 'var(--color-accent-primary)' : undefined,
                  boxShadow: plan.highlight ? 'var(--shadow-glow)' : undefined,
                  position: 'relative',
                }}
              >
                {plan.highlight && (
                  <div
                    className="badge badge--accent"
                    style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)' }}
                  >
                    Most Popular
                  </div>
                )}
                <h3 className="heading-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>{plan.name}</h3>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700 }}>
                    {plan.price}
                  </span>
                  <span className="text-small">{plan.period}</span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: 'var(--spacing-xl)' }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="text-small"
                      style={{
                        padding: '0.375rem 0',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                      }}
                    >
                      <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`btn ${plan.highlight ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ width: '100%' }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'var(--spacing-4xl) 0', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <h2 className="heading-lg" style={{ marginBottom: 'var(--spacing-md)' }}>
            Ready to Build Winning Fantasy Products?
          </h2>
          <p className="text-body" style={{ maxWidth: 500, margin: '0 auto var(--spacing-xl)' }}>
            Get your free API key in seconds. No credit card required.
          </p>
          <Link href="/signup" className="btn btn--primary btn--lg">
            Get Free API Key
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} CricSynthesis. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
