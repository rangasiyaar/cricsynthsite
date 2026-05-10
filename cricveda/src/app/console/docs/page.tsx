'use client';

const ENDPOINT_GROUPS = [
  {
    title: 'Players',
    endpoints: [
      { method: 'GET', path: '/api/v1/players', params: '?search=&role=&country=&page=&per_page=', desc: 'List players with optional filtering and pagination.' },
      { method: 'GET', path: '/api/v1/players/:id', params: '', desc: 'Get full player profile with career statistics.' },
      { method: 'GET', path: '/api/v1/players/:id/form', params: '?type=overall', desc: 'Cross-league form score (0–10) with trend, confidence, and breakdown.' },
    ],
  },
  {
    title: 'Matches',
    endpoints: [
      { method: 'GET', path: '/api/v1/matches', params: '?league=&status=upcoming&page=&per_page=', desc: 'List upcoming, live, or completed matches.' },
      { method: 'GET', path: '/api/v1/matches/:id/insights', params: '', desc: 'All pre-computed insights for a match.' },
      { method: 'GET', path: '/api/v1/matches/:id/recommendations', params: '', desc: 'Combined dream team, captain picks, and differentials. Requires auth.' },
    ],
  },
  {
    title: 'Matchups',
    endpoints: [
      { method: 'GET', path: '/api/v1/matchups/batter-vs-bowler', params: '?batter_id=&bowler_id=', desc: 'Head-to-head stats with phase breakdown. Requires auth.' },
      { method: 'GET', path: '/api/v1/matchups/key-battles/:match_id', params: '', desc: 'Top key battles for a fixture. Requires auth.' },
    ],
  },
  {
    title: 'Fantasy',
    endpoints: [
      { method: 'GET', path: '/api/v1/fantasy/:match_id/dream-team', params: '', desc: 'AI-generated Dream11-compliant team. Requires auth.' },
      { method: 'GET', path: '/api/v1/fantasy/:match_id/captain-picks', params: '', desc: 'Top 3 captain recommendations with risk levels. Requires auth.' },
    ],
  },
  {
    title: 'Venues',
    endpoints: [
      { method: 'GET', path: '/api/v1/venues/:id', params: '', desc: 'Venue intelligence: pace/spin split, avg scores, phase breakdown. Requires auth.' },
    ],
  },
  {
    title: 'Predictions & Leaderboards',
    endpoints: [
      { method: 'GET', path: '/api/v1/predictions/:match_id', params: '', desc: 'Win probability prediction for a match. Requires auth.' },
      { method: 'GET', path: '/api/v1/leaderboards', params: '?type=form&league=all&role=all', desc: 'Player rankings by form, fantasy, consistency.' },
    ],
  },
];

export default function ConsoleDocsPage() {
  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h1 className="heading-lg" style={{ marginBottom: 'var(--spacing-xs)' }}>API Documentation</h1>
        <p className="text-body">
          Base URL: <code className="text-mono" style={{ color: 'var(--color-accent-secondary)' }}>
            https://cricsynthesis.in/cricveda/api/v1
          </code>
        </p>
      </div>

      {/* Auth Section */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-2xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-md)' }}>Authentication</h2>
        <p className="text-body" style={{ marginBottom: 'var(--spacing-md)' }}>
          Include your API key in the <code className="text-mono">Authorization</code> header:
        </p>
        <div className="code-block">
          <pre>
            <span className="keyword">Authorization:</span> Bearer cs_your_api_key_here
          </pre>
        </div>
      </div>

      {/* Response Format */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-2xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-md)' }}>Response Format</h2>
        <div className="code-block">
          <pre>{`{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "cached": false,
    "cache_age_seconds": null,
    "api_version": "v1"
  }
}`}</pre>
        </div>
      </div>

      {/* Endpoint Groups */}
      {ENDPOINT_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 'var(--spacing-2xl)' }}>
          <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>{group.title}</h2>
          {group.endpoints.map((ep) => (
            <div
              key={ep.path}
              className="card--flat"
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
                <span className="badge badge--accent" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {ep.method}
                </span>
                <code className="text-mono" style={{ color: 'var(--color-text-primary)', fontSize: '0.875rem' }}>
                  {ep.path}{ep.params}
                </code>
              </div>
              <p className="text-small">{ep.desc}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
