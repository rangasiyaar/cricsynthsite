'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const CRICVEDA_API_URL = 'https://api.cricsynthesis.in';

// ── Mock responses ─────────────────────────────────────────────────────────────
const MOCKS = {
  'win-probability': {
    win_probability: 0.42,
    runs_needed: 80,
    balls_remaining: 60,
    required_rr: 8.0,
    blueprint: [
      { over: 12, target_runs_by_end: 96 },
      { over: 15, target_runs_by_end: 120 },
      { over: 18, target_runs_by_end: 144 }
    ],
    sample_size: 312,
    confidence: 'high'
  },
  'collapse-probability': {
    collapse_probability: 0.28,
    definition: '3+ wickets in next 30 balls',
    most_common_trigger: 'caught',
    expected_runs_if_collapse: 32.4,
    expected_runs_if_no_collapse: 67.1,
    sample_size: 186,
    confidence: 'medium'
  },
  'momentum': {
    player_id: 253802,
    momentum_score: 7.8,
    signal: 'hot',
    matches_in_window: 8,
    days_since_last_match: 3,
    recent_activity: [
      { match_date: '2026-07-10', league_id: 't20i', total_points: 74.5, z_score: 1.82, weight: 0.91 },
      { match_date: '2026-07-06', league_id: 'ipl',  total_points: 61.0, z_score: 1.24, weight: 0.87 },
      { match_date: '2026-07-01', league_id: 'ipl',  total_points: 48.5, z_score: 0.74, weight: 0.81 },
      { match_date: '2026-06-26', league_id: 't20i', total_points: 82.0, z_score: 2.10, weight: 0.74 },
      { match_date: '2026-06-22', league_id: 'bbl',  total_points: 55.0, z_score: 1.12, weight: 0.68 }
    ]
  },
  'clutch': {
    player_id: 253802,
    clutch_batting_sr: 148.6,
    clutch_batting_avg: 34.2,
    clutch_bowling_economy: null,
    clutch_deliveries: 184,
    clutch_index: 8.2,
    signal: 'elite_clutch'
  },
  'phase-profile': {
    player_id: 253802,
    format: 'T20',
    powerplay: { sr: 128.4, avg: 31.2, boundary_pct: 0.22, dot_pct: 0.38, dismissal_rate_per_100: 8.1 },
    middle:    { sr: 118.0, avg: 34.5, boundary_pct: 0.18, dot_pct: 0.42, dismissal_rate_per_100: 6.3 },
    death:     { sr: 162.4, avg: 22.0, boundary_pct: 0.31, dot_pct: 0.28, dismissal_rate_per_100: 12.4 },
    acceleration_score: 34.0,
    player_type: 'finisher'
  },
  'pitch-reading': {
    match_id: 12345,
    overs_analyzed: 3,
    classification: 'pace-friendly',
    confidence: 'high',
    actual_run_rate: 6.8,
    wickets_in_sample: 4,
    wicket_types: { bowled: 2, lbw: 1, caught: 1 },
    pace_indicator: 0.75,
    vs_venue_baseline: 'below',
    interpretation: '4 wickets in 3 overs with 3 bowled/LBW suggests significant seam and swing movement.'
  },
  'final-over-specialists': {
    league_id: 'ipl',
    season: '2024',
    role: 'bowler',
    over_analyzed: '20th over (T20)',
    specialists: [
      { player_id: 277916, name: 'Jasprit Bumrah',   balls: 42, economy: 5.14, wickets: 8 },
      { player_id: 419898, name: 'Arshdeep Singh',   balls: 36, economy: 7.33, wickets: 5 },
      { player_id: 290716, name: 'Ravindra Jadeja',  balls: 28, economy: 7.71, wickets: 3 },
      { player_id: 322890, name: 'Rashid Khan',       balls: 24, economy: 6.50, wickets: 4 },
      { player_id: 481896, name: 'Hardik Pandya',    balls: 18, economy: 8.33, wickets: 2 }
    ]
  }
};

// ── Endpoint config ───────────────────────────────────────────────────────────
const ENDPOINTS = [
  {
    id: 'win-probability',
    label: 'Win Probability',
    path: '/v1/oracle/win-probability',
    mockKey: 'win-probability',
    params: [
      { name: 'format',  label: 'format',  type: 'select', options: ['T20', 'ODI'], default: 'T20', desc: 'Match format' },
      { name: 'innings', label: 'innings', type: 'number', placeholder: '2', default: '2', min: 1, max: 2, desc: '1 or 2' },
      { name: 'over',    label: 'over',    type: 'number', placeholder: '10', default: '10', min: 1, max: 50, desc: 'Current over' },
      { name: 'wickets', label: 'wickets', type: 'number', placeholder: '3', default: '3', min: 0, max: 10, desc: 'Wickets fallen' },
      { name: 'runs',    label: 'runs',    type: 'number', placeholder: '80', default: '80', min: 0, desc: 'Runs scored so far' },
      { name: 'target',  label: 'target',  type: 'number', placeholder: '160', default: '160', min: 1, desc: 'Target (innings 2 only)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams();
      q.set('format', p.format || 'T20');
      q.set('innings', p.innings || '2');
      q.set('over', p.over || '10');
      q.set('wickets', p.wickets || '3');
      q.set('runs', p.runs || '80');
      if (p.target) q.set('target', p.target);
      return `/v1/oracle/win-probability?${q}`;
    }
  },
  {
    id: 'collapse-probability',
    label: 'Collapse Probability',
    path: '/v1/oracle/collapse-probability',
    mockKey: 'collapse-probability',
    params: [
      { name: 'format',  label: 'format',  type: 'select', options: ['T20', 'ODI'], default: 'T20', desc: 'Match format' },
      { name: 'innings', label: 'innings', type: 'number', placeholder: '1', default: '1', min: 1, max: 2, desc: '1 or 2' },
      { name: 'over',    label: 'over',    type: 'number', placeholder: '8', default: '8', min: 1, max: 50, desc: 'Current over' },
      { name: 'wickets', label: 'wickets', type: 'number', placeholder: '2', default: '2', min: 0, max: 10, desc: 'Wickets fallen' },
      { name: 'score',   label: 'score',   type: 'number', placeholder: '65', default: '65', min: 0, desc: 'Current score' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ format: p.format || 'T20', innings: p.innings || '1', over: p.over || '8', wickets: p.wickets || '2', score: p.score || '65' });
      return `/v1/oracle/collapse-probability?${q}`;
    }
  },
  {
    id: 'momentum',
    label: 'Player Momentum',
    path: '/v1/players/{id}/momentum',
    mockKey: 'momentum',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Cricsheet player registry ID' },
      { name: 'days',      label: 'days',      type: 'number', placeholder: '60',     default: '60',     min: 7, max: 180, desc: 'Look-back window in days' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ days: p.days || '60' });
      return `/v1/players/${p.player_id || 253802}/momentum?${q}`;
    }
  },
  {
    id: 'clutch',
    label: 'Clutch Score',
    path: '/v1/players/{id}/clutch',
    mockKey: 'clutch',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Cricsheet player registry ID' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024',   default: '',       desc: 'Filter by season (optional)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams();
      if (p.season) q.set('season', p.season);
      const qs = q.toString() ? `?${q}` : '';
      return `/v1/players/${p.player_id || 253802}/clutch${qs}`;
    }
  },
  {
    id: 'phase-profile',
    label: 'Phase Profile',
    path: '/v1/players/{id}/phase-profile',
    mockKey: 'phase-profile',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Cricsheet player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20', 'ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id || 253802}/phase-profile?format=${p.format || 'T20'}`; }
  },
  {
    id: 'pitch-reading',
    label: 'Pitch Reading',
    path: '/v1/matches/{id}/pitch-reading',
    mockKey: 'pitch-reading',
    params: [
      { name: 'match_id',   label: 'match_id',   type: 'number', placeholder: '12345', default: '12345', desc: 'Historical match ID' },
      { name: 'after_over', label: 'after_over',  type: 'number', placeholder: '3',     default: '3',     min: 1, max: 10, desc: 'Read pitch after N overs' }
    ],
    buildPath(p) { return `/v1/matches/${p.match_id || 12345}/pitch-reading?after_over=${p.after_over || 3}`; }
  },
  {
    id: 'final-over-specialists',
    label: 'Final Over Specialists',
    path: '/v1/leagues/{id}/final-over-specialists',
    mockKey: 'final-over-specialists',
    params: [
      { name: 'league_id', label: 'league_id', type: 'text',   placeholder: 'ipl',    default: 'ipl',    desc: 'League (ipl, t20i, bbl, psl…)' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024',   default: '2024',   desc: 'Season year' },
      { name: 'role',      label: 'role',      type: 'select', options: ['bowler', 'batter'], default: 'bowler', desc: 'bowler or batter' },
      { name: 'limit',     label: 'limit',     type: 'number', placeholder: '10',     default: '10',     min: 1, max: 25, desc: 'Max results' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ role: p.role || 'bowler', limit: p.limit || '10' });
      if (p.season) q.set('season', p.season);
      return `/v1/leagues/${p.league_id || 'ipl'}/final-over-specialists?${q}`;
    }
  }
];

// ── State ─────────────────────────────────────────────────────────────────────
let activeEp = ENDPOINTS[0];
let isRunning = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getParamValues() {
  const vals = {};
  activeEp.params.forEach(p => {
    const el = document.getElementById(`pg-param-${p.name}`);
    if (el) vals[p.name] = el.value.trim();
  });
  return vals;
}

function getApiKey() {
  return document.getElementById('pg-key-input').value.trim() || 'cv_demo_readonly';
}

function buildUrl() {
  return CRICVEDA_API_URL + activeEp.buildPath(getParamValues());
}

function buildCurl() {
  const url = buildUrl();
  const key = getApiKey() || 'YOUR_API_KEY';
  return `curl "${url}" \\\n  -H "X-API-Key: ${key}"`;
}

function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="j-key">${match}</span>`;
        return `<span class="j-str">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="j-bool">${match}</span>`;
      if (/null/.test(match))       return `<span class="j-null">${match}</span>`;
      return `<span class="j-num">${match}</span>`;
    }
  );
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
  btn.classList.add('copied');
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy'; }, 2000);
}

// ── DOM rendering ─────────────────────────────────────────────────────────────
function renderParams() {
  const container = document.getElementById('pg-params');
  container.innerHTML = '';
  activeEp.params.forEach(p => {
    const group = document.createElement('div');
    group.className = 'pg-param-group';
    let input;
    if (p.type === 'select') {
      input = document.createElement('select');
      input.className = 'pg-param-select';
      p.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt || '— any —';
        if (opt === p.default) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = p.type; input.className = 'pg-param-input';
      if (p.placeholder) input.placeholder = p.placeholder;
      if (p.default) input.value = p.default;
      if (p.min !== undefined) input.min = p.min;
      if (p.max !== undefined) input.max = p.max;
    }
    input.id = `pg-param-${p.name}`;
    input.addEventListener('input', () => {
      document.getElementById('pg-curl-code').textContent = buildCurl();
    });
    group.innerHTML = `<label class="pg-param-label" for="pg-param-${p.name}">${p.label} <span class="pg-param-type">${p.type}</span></label>`;
    group.appendChild(input);
    if (p.desc) {
      const d = document.createElement('p'); d.className = 'pg-param-desc'; d.textContent = p.desc;
      group.appendChild(d);
    }
    container.appendChild(group);
  });
  document.getElementById('pg-curl-code').textContent = buildCurl();
}

function setEndpoint(ep) {
  activeEp = ep;
  document.querySelectorAll('.pg-ep-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === ep.id);
  });
  renderParams();
  clearResponse();
}

function clearResponse() {
  document.getElementById('pg-status-bar').innerHTML = '';
  document.getElementById('pg-response-body').innerHTML = `
    <div class="pg-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
      </svg>
      <p>Hit <strong>Run Request</strong> to see the response.</p>
    </div>`;
}

function showResponse(data, status, latency) {
  const bar = document.getElementById('pg-status-bar');
  const ok = status >= 200 && status < 300;
  bar.innerHTML = `
    <span class="pg-status-badge ${ok ? 'ok' : 'err'}">${status}</span>
    <span class="pg-status-latency">${latency}ms</span>`;

  const body = document.getElementById('pg-response-body');
  if (ok) {
    body.innerHTML = `<pre class="pg-json">${syntaxHighlight(data)}</pre>`;
  } else {
    body.innerHTML = `<div class="pg-error-card"><p>${JSON.stringify(data, null, 2)}</p></div>`;
  }
}

// ── Request runner ─────────────────────────────────────────────────────────────
async function runRequest() {
  if (isRunning) return;
  isRunning = true;

  const btn = document.getElementById('pg-run-btn-inline');
  btn.disabled = true;
  btn.innerHTML = '<span class="pg-spinner"></span> Running…';

  const t0 = performance.now();

  try {
    const key = getApiKey();
    const url = buildUrl();

    if (!key || key === 'cv_demo_readonly') {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
      const latency = Math.round(performance.now() - t0);
      showResponse(MOCKS[activeEp.mockKey], 200, latency);
    } else {
      const res = await fetch(url, { headers: { 'X-API-Key': key } });
      const latency = Math.round(performance.now() - t0);
      let data;
      try { data = await res.json(); } catch { data = { error: 'Non-JSON response' }; }
      if (!res.ok && res.status === 0) {
        showResponse(MOCKS[activeEp.mockKey], 200, latency);
      } else {
        showResponse(data, res.status, latency);
      }
    }
  } catch {
    const latency = Math.round(performance.now() - t0);
    showResponse(MOCKS[activeEp.mockKey], 200, latency);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run';
    isRunning = false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pg-ep-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = ENDPOINTS.find(e => e.id === btn.dataset.id);
      if (ep) setEndpoint(ep);
    });
  });

  const keyInput = document.getElementById('pg-key-input');
  keyInput.addEventListener('input', () => {
    document.getElementById('pg-curl-code').textContent = buildCurl();
  });

  document.getElementById('pg-key-clear').addEventListener('click', () => {
    keyInput.value = '';
    document.getElementById('pg-curl-code').textContent = buildCurl();
  });

  document.getElementById('pg-run-btn-inline').addEventListener('click', runRequest);

  document.getElementById('pg-curl-copy').addEventListener('click', function() {
    copyText(document.getElementById('pg-curl-code').textContent, this);
  });

  document.getElementById('pg-response-copy').addEventListener('click', function() {
    const pre = document.querySelector('#pg-response-body .pg-json');
    if (pre) copyText(pre.textContent, this);
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runRequest();
  });

  renderParams();
  clearResponse();
});
