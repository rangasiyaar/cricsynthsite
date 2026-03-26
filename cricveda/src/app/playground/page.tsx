"use client";
import React, { useState } from "react";
import Link from "next/link";

const presets = [
  { name: 'Player Form Score', method: 'GET', url: '/api/v1/players/42/form', body: '' },
  { name: 'Search Players', method: 'GET', url: '/api/v1/players?search=virat&role=batter', body: '' },
  { name: 'Upcoming Matches', method: 'GET', url: '/api/v1/matches?status=upcoming', body: '' },
  { name: 'Match Insights', method: 'GET', url: '/api/v1/matches/1/insights', body: '' },
  { name: 'Batter vs Bowler', method: 'GET', url: '/api/v1/matchups/batter-vs-bowler?batter_id=1&bowler_id=2', body: '' },
  { name: 'Venue Intel', method: 'GET', url: '/api/v1/venues/1', body: '' },
  { name: 'Dream Team', method: 'GET', url: '/api/v1/fantasy/1/dream-team', body: '' },
  { name: 'Captain Picks', method: 'GET', url: '/api/v1/fantasy/1/captain-picks', body: '' },
  { name: 'Health Check', method: 'GET', url: '/api/v1/health', body: '' },
];

export default function PlaygroundPage() {
  const [apiKey, setApiKey] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('/api/v1/health');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    const start = Date.now();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { method, headers });
      setStatusCode(res.status);
      setResponseTime(Date.now() - start);
      const json = await res.json();
      setResponse(JSON.stringify(json, null, 2));
    } catch (err) {
      setStatusCode(0);
      setResponseTime(Date.now() - start);
      setResponse(`Error: ${(err as Error).message}`);
    }
    setLoading(false);
  };

  const loadPreset = (preset: typeof presets[0]) => {
    setMethod(preset.method);
    setUrl(preset.url);
    setResponse(null);
    setStatusCode(null);
  };

  return (
    <>
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/docs">API Docs</Link>
              <Link href="/playground" style={{ color: 'var(--color-text-primary)' }}>Playground</Link>
              <Link href="/dashboard" className="nav-cta">Dashboard</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <span className="section-label" style={{ marginBottom: '1rem' }}>Live Testing</span>
          <h1 className="section-title">API Playground</h1>
          <p className="section-description" style={{ maxWidth: 600 }}>
            Test CricVeda endpoints in real-time. Select a preset or enter a custom URL.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
          {/* Presets sidebar */}
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Quick Presets</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {presets.map((p, i) => (
                <button key={i} onClick={() => loadPreset(p)}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: 'none', textAlign: 'left',
                    background: url === p.url ? 'var(--color-accent-glow)' : 'transparent',
                    color: url === p.url ? 'var(--color-accent-secondary)' : 'var(--color-text-tertiary)',
                    fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font-primary)', cursor: 'pointer',
                    transition: 'all 150ms',
                  }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.625rem', fontWeight: 700, marginRight: '0.375rem',
                    color: 'var(--color-success)',
                  }}>{p.method}</span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Request panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* API Key */}
            <div className="card">
              <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>API Key (optional for free endpoints)</label>
              <input
                type="password"
                className="input"
                placeholder="cv_your_api_key_here"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
              />
            </div>

            {/* Request URL */}
            <div className="card">
              <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Request</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="input" style={{ width: 100, flexShrink: 0 }} value={method} onChange={e => setMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                </select>
                <input
                  className="input"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="/api/v1/..."
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleSend} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
                  {loading ? 'Sending...' : 'Send →'}
                </button>
              </div>
            </div>

            {/* Response */}
            <div className="card" style={{ background: 'var(--color-bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Response</span>
                {statusCode !== null && (
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                      color: statusCode >= 200 && statusCode < 300 ? 'var(--color-success)' : statusCode >= 400 ? 'var(--color-danger)' : 'var(--color-warning)',
                    }}>
                      {statusCode} {statusCode === 200 ? 'OK' : statusCode === 401 ? 'Unauthorized' : statusCode === 429 ? 'Rate Limited' : ''}
                    </span>
                    {responseTime !== null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{responseTime}ms</span>
                    )}
                  </div>
                )}
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', lineHeight: 1.7,
                color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap',
                minHeight: 200, maxHeight: 500, overflowY: 'auto',
              }}>
                {response || (loading ? 'Sending request...' : '// Response will appear here')}
              </pre>
            </div>
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
