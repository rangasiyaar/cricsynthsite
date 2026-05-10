'use client';

import { useEffect, useState } from 'react';

export default function ConsoleSettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; plan: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cs_user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  function handleLogout() {
    localStorage.removeItem('cs_user');
    window.location.href = '/cricveda/login';
  }

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h1 className="heading-lg" style={{ marginBottom: 'var(--spacing-xs)' }}>Settings</h1>
        <p className="text-body">Manage your account and preferences.</p>
      </div>

      {/* Profile */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>Profile</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--spacing-md)', alignItems: 'center' }}>
          <span className="text-small" style={{ fontWeight: 500 }}>Name</span>
          <span>{user?.name || '—'}</span>
          <span className="text-small" style={{ fontWeight: 500 }}>Email</span>
          <span>{user?.email || '—'}</span>
          <span className="text-small" style={{ fontWeight: 500 }}>Plan</span>
          <span style={{ textTransform: 'capitalize' }}>{user?.plan || '—'}</span>
        </div>
      </div>

      {/* Plan */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-md)' }}>Subscription</h2>
        <p className="text-body" style={{ marginBottom: 'var(--spacing-lg)' }}>
          You are on the <strong style={{ textTransform: 'capitalize' }}>{user?.plan || 'free'}</strong> plan.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
          <button className="btn btn--primary btn--sm">Upgrade Plan</button>
          <button className="btn btn--ghost btn--sm">View Invoices</button>
        </div>
      </div>

      {/* Notifications */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="heading-sm" style={{ marginBottom: 'var(--spacing-md)' }}>Notifications</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {[
            { label: 'Usage alerts (80% / 100% limit)', defaultOn: true },
            { label: 'API key expiry reminders', defaultOn: true },
            { label: 'Product updates & changelog', defaultOn: false },
          ].map((n) => (
            <label key={n.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={n.defaultOn} style={{ accentColor: 'var(--color-accent-secondary)' }} />
              <span className="text-small">{n.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.3)', marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="heading-sm" style={{ color: 'var(--color-error)', marginBottom: 'var(--spacing-md)' }}>Danger Zone</h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
          <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
            Sign Out
          </button>
          <button className="btn btn--ghost btn--sm" style={{ color: 'var(--color-error)' }}>
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
