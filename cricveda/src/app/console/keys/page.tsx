'use client';

import { useEffect, useState } from 'react';

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function ConsoleKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);

  async function fetchKeys() {
    try {
      const res = await fetch('/api/console/keys', {
        headers: { 'x-user-id': getUserId() },
      });
      const data = await res.json();
      if (data.success) setKeys(data.data.keys);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  function getUserId(): string {
    const stored = localStorage.getItem('cs_user');
    return stored ? JSON.parse(stored).id : '';
  }

  useEffect(() => { fetchKeys(); }, []);

  async function handleCreate() {
    setCreating(true);
    setNewKey('');
    try {
      const res = await fetch('/api/console/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
        body: JSON.stringify({ name: newKeyName || 'Default' }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKey(data.data.key);
        setNewKeyName('');
        fetchKeys();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(keyId: string, action: 'revoke' | 'regenerate') {
    try {
      const res = await fetch('/api/console/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
        body: JSON.stringify({ action, key_id: keyId }),
      });
      const data = await res.json();
      if (data.success && action === 'regenerate' && data.data.key) {
        setNewKey(data.data.key);
      }
      fetchKeys();
    } catch {
      // silent
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <h1 className="heading-lg" style={{ marginBottom: 'var(--spacing-xs)' }}>API Keys</h1>
        <p className="text-body">Manage your CricSynthesis API keys. All keys use the <code className="text-mono" style={{ color: 'var(--color-accent-secondary)' }}>cs_</code> prefix.</p>
      </div>

      {/* New Key Banner */}
      {newKey && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'var(--color-success-bg)' }}>
          <p style={{ color: 'var(--color-success)', fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>
            New API Key Generated
          </p>
          <p className="text-small" style={{ marginBottom: 'var(--spacing-md)' }}>
            Copy this key now. It won&apos;t be shown again.
          </p>
          <div className="code-block" style={{ marginBottom: 'var(--spacing-md)', wordBreak: 'break-all' }}>
            <pre style={{ color: 'var(--color-success)' }}>{newKey}</pre>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={() => navigator.clipboard.writeText(newKey)}>
            Copy Key
          </button>
        </div>
      )}

      {/* Create Key */}
      <div className="card--flat" style={{ padding: 'var(--spacing-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: 'var(--spacing-xl)', display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="label">Key Name</label>
          <input
            className="input"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g., Production, Development"
          />
        </div>
        <button className="btn btn--primary" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : 'Generate New Key'}
        </button>
      </div>

      {/* Keys Table */}
      {loading ? (
        <div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8, borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
          <p className="text-body">No API keys yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key Prefix</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 500 }}>{k.name}</td>
                  <td className="text-mono">{k.key_prefix}...</td>
                  <td>
                    <span className={`badge ${k.is_active ? 'badge--success' : 'badge--error'}`}>
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td>
                    {k.is_active && (
                      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleAction(k.id, 'regenerate')}>
                          Regenerate
                        </button>
                        <button className="btn btn--ghost btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => handleAction(k.id, 'revoke')}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
