'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/console', label: 'Overview', icon: '📊' },
  { href: '/console/keys', label: 'API Keys', icon: '🔑' },
  { href: '/console/usage', label: 'Usage', icon: '📈' },
  { href: '/console/docs', label: 'API Docs', icon: '📖' },
  { href: '/console/settings', label: 'Settings', icon: '⚙️' },
];

const PRODUCTS = [
  { id: 'cricveda', name: 'CricVeda', status: 'active' },
  { id: 'matchsynth', name: 'MatchSynth', status: 'coming_soon' },
  { id: 'graphsynth', name: 'GraphSynth', status: 'coming_soon' },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string; plan: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cs_user');
    if (stored) {
      setUser(JSON.parse(stored));
    } else {
      window.location.href = '/cricveda/login';
    }
  }, []);

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="skeleton" style={{ width: 200, height: 20 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '0 var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
          <Link href="/" className="nav__logo" style={{ fontSize: '1.125rem' }}>
            Cric<span>Synthesis</span>
          </Link>
        </div>

        {/* Product Switcher */}
        <div style={{ padding: '0 var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
          <p className="text-small" style={{ marginBottom: 'var(--spacing-sm)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.6875rem' }}>
            Products
          </p>
          {PRODUCTS.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '2px',
                background: p.status === 'active' ? 'var(--color-accent-glow)' : 'transparent',
                opacity: p.status === 'active' ? 1 : 0.5,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: p.status === 'active' ? 'var(--color-accent-secondary)' : 'var(--color-text-tertiary)' }}>
                {p.name}
              </span>
              {p.status === 'coming_soon' && (
                <span className="badge" style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: 'var(--color-bg-card)', color: 'var(--color-text-muted)' }}>
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Nav Links */}
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link ${pathname === item.href ? 'sidebar__link--active' : ''}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div style={{ padding: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'white',
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{user.name}</div>
              <div className="text-small" style={{ fontSize: '0.6875rem' }}>{user.plan} plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: 'var(--spacing-xl) var(--spacing-2xl)', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
