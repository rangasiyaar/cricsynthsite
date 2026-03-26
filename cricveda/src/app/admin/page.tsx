"use client";
import React, { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'fixtures' | 'playing-xi' | 'recompute' | 'system'>('fixtures');

  return (
    <>
      <nav className="nav">
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">CricVeda</Link>
            <div className="nav-links">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/admin" style={{ color: 'var(--color-text-primary)' }}>Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: '3rem 2rem 5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Admin Panel</h1>
          <span className="badge badge-danger">Internal</span>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>Manage fixtures, playing XI, and trigger pre-computation.</p>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '0.25rem',
          background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: '0.375rem', marginBottom: '2rem', width: 'fit-content',
        }}>
          {(['fixtures', 'playing-xi', 'recompute', 'system'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-md)', border: 'none',
                background: activeTab === tab ? 'var(--color-bg-glass)' : 'transparent',
                color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font-primary)', cursor: 'pointer',
                boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none',
              }}>
              {tab === 'fixtures' ? 'Fixtures' : tab === 'playing-xi' ? 'Playing XI' : tab === 'recompute' ? 'Recompute' : 'System'}
            </button>
          ))}
        </div>

        {/* Fixtures Tab */}
        {activeTab === 'fixtures' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem' }}>Add Fixture</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>League</label>
                  <select className="input"><option>IPL</option><option>T20I</option><option>BBL</option><option>PSL</option><option>CPL</option><option>SA20</option></select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Date</label>
                  <input type="date" className="input" />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Team 1</label>
                  <input type="text" className="input" placeholder="e.g. Mumbai Indians" />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Team 2</label>
                  <input type="text" className="input" placeholder="e.g. Chennai Super Kings" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Venue</label>
                  <input type="text" className="input" placeholder="e.g. Wankhede Stadium, Mumbai" />
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: '1.25rem' }}>Create Fixture</button>
            </div>

            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem' }}>Bulk Upload (CSV)</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>
                Upload a CSV with columns: league_id, date, time, team1, team2, venue, city
              </p>
              <input type="file" accept=".csv" className="input" style={{ maxWidth: 400 }} />
              <button className="btn btn-outline" style={{ marginTop: '0.75rem' }}>Upload CSV</button>
            </div>
          </div>
        )}

        {/* Playing XI Tab */}
        {activeTab === 'playing-xi' && (
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>Set Playing XI</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1.5rem' }}>
              Select a fixture and set the confirmed playing XI for both teams. This triggers insight pre-computation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Fixture</label>
                <select className="input"><option>Select Fixture...</option></select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Team</label>
                <select className="input"><option>Team 1</option><option>Team 2</option></select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Player Names (one per line)</label>
              <textarea className="input" rows={11} placeholder="Rohit Sharma&#10;Ishan Kishan&#10;Suryakumar Yadav&#10;..." style={{ resize: 'vertical' }} />
            </div>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }}>Save Playing XI & Trigger Recompute</button>
          </div>
        )}

        {/* Recompute Tab */}
        {activeTab === 'recompute' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>Recompute All Insights</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>
                Re-runs the full pre-computation pipeline: form scores for all players, then dream team, captain picks, key battles, and differentials for all upcoming fixtures.
              </p>
              <button className="btn btn-primary">Run Full Pre-Computation</button>
            </div>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>Recompute Single Fixture</h3>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Fixture ID</label>
                  <input type="number" className="input" placeholder="e.g. 42" />
                </div>
                <button className="btn btn-outline">Recompute</button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>Ingest CricSheet Data</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>
                Triggers the data ingestion pipeline. Place CricSheet JSON files in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>data/cricsheet/</code> before running.
              </p>
              <button className="btn btn-outline">Run Ingestion</button>
            </div>
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="metrics-row">
              <div className="metric-card">
                <div className="metric-value">✓</div>
                <div className="metric-label">Supabase</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">✓</div>
                <div className="metric-label">Redis</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">v1</div>
                <div className="metric-label">API Version</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">18</div>
                <div className="metric-label">Endpoints</div>
              </div>
            </div>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem' }}>Data Counts</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Table</th><th>Count</th><th>Last Updated</th></tr></thead>
                  <tbody>
                    <tr><td>Players</td><td>—</td><td>—</td></tr>
                    <tr><td>Matches</td><td>—</td><td>—</td></tr>
                    <tr><td>Deliveries</td><td>—</td><td>—</td></tr>
                    <tr><td>Fixtures</td><td>—</td><td>—</td></tr>
                    <tr><td>Form Scores</td><td>—</td><td>—</td></tr>
                    <tr><td>Precomputed Insights</td><td>—</td><td>—</td></tr>
                    <tr><td>Users</td><td>—</td><td>—</td></tr>
                    <tr><td>API Keys</td><td>—</td><td>—</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
