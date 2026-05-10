'use client';

import { useEffect, useState } from 'react';

export default function ConsoleUsagePage() {
  const [usage, setUsage] = useState<{
    total_requests: number;
    error_count: number;
    error_rate: number;
    period_days: number;
  } | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      const stored = localStorage.getItem('cs_user');
      const userId = stored ? JSON.parse(stored).id : '';
      try {
        const res = await fetch('/api/console/usage?days=30', {
          headers: { 'x-user-id': userId },
        });
        const data = await res.json();
        if (data.success) setUsage(data.data);
      } catch {
        // silent
      }
    }
    fetchUsage();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h1 className="heading-lg" style={{ marginBottom: 'var(--spacing-xs)' }}>Usage Analytics</h1>
        <p className="text-body">Monitor your API consumption and performance.</p>
      </div>

      <div className="grid grid--4" style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <div className="metric-card">
          <div className="metric-card__value">{usage?.total_requests ?? '—'}</div>
          <div className="metric-card__label">Total Requests (30d)</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__value">{usage?.error_count ?? '—'}</div>
          <div className="metric-card__label">Errors (30d)</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__value">{usage ? `${usage.error_rate}%` : '—'}</div>
          <div className="metric-card__label">Error Rate</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__value text-gradient">&lt;200ms</div>
          <div className="metric-card__label">Avg Latency</div>
        </div>
      </div>

      {/* Rate Limits */}
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>Rate Limits by Plan</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Daily Limit</th>
                <th>Rate</th>
                <th>Burst</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="badge badge--accent">Free</span></td>
                <td>100 / day</td>
                <td>10 / min</td>
                <td>No</td>
              </tr>
              <tr>
                <td><span className="badge badge--success">Pro</span></td>
                <td>5,000 / day</td>
                <td>100 / min</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td><span className="badge badge--warning">Enterprise</span></td>
                <td>50,000+ / day</td>
                <td>Custom</td>
                <td>Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
        <p className="text-body">Detailed usage charts and endpoint-level analytics coming soon.</p>
      </div>
    </div>
  );
}
