'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const CRICVEDA_API_URL = 'https://api.cricsynthesis.in';
const DEMO_KEY = 'cv_demo_readonly';

// ── Mock responses ────────────────────────────────────────────────────────────
const MOCKS = {
  'upcoming': [
    { upcoming_id: 42, league_id: 'ipl', match_date: '2026-03-22', team1: 'Mumbai Indians', team2: 'Chennai Super Kings', format: 'T20', status: 'scheduled', toss_winner: null, toss_decision: null },
    { upcoming_id: 43, league_id: 'ipl', match_date: '2026-03-24', team1: 'Royal Challengers Bengaluru', team2: 'Kolkata Knight Riders', format: 'T20', status: 'scheduled', toss_winner: null, toss_decision: null },
    { upcoming_id: 44, league_id: 'ipl', match_date: '2026-03-25', team1: 'Delhi Capitals', team2: 'Sunrisers Hyderabad', format: 'T20', status: 'scheduled', toss_winner: null, toss_decision: null }
  ],
  'prediction': {
    upcoming_id: 42, team1: 'Mumbai Indians', team2: 'Chennai Super Kings',
    match_date: '2026-03-22',
    players: [
      { player_id: 28081,  player_name: 'MS Dhoni',         team: 'Chennai Super Kings', role: 'WK',   predicted_points: 64.2, credits: 9.5, model_version: '20260101' },
      { player_id: 253802, player_name: 'Virat Kohli',       team: 'Royal Challengers Bengaluru', role: 'BAT',  predicted_points: 61.8, credits: 11.0, model_version: '20260101' },
      { player_id: 34102,  player_name: 'Rohit Sharma',      team: 'Mumbai Indians', role: 'BAT',  predicted_points: 58.5, credits: 10.5, model_version: '20260101' },
      { player_id: 277916, player_name: 'Jasprit Bumrah',    team: 'Mumbai Indians', role: 'BOWL', predicted_points: 56.1, credits: 10.0, model_version: '20260101' },
      { player_id: 625383, player_name: 'Ruturaj Gaikwad',   team: 'Chennai Super Kings', role: 'BAT',  predicted_points: 51.3, credits: 9.0, model_version: '20260101' },
      { player_id: 481896, player_name: 'Hardik Pandya',     team: 'Mumbai Indians', role: 'AR',   predicted_points: 49.7, credits: 10.0, model_version: '20260101' },
      { player_id: 290716, player_name: 'Ravindra Jadeja',   team: 'Chennai Super Kings', role: 'AR',   predicted_points: 47.2, credits: 9.5, model_version: '20260101' },
      { player_id: 308967, player_name: 'Suryakumar Yadav',  team: 'Mumbai Indians', role: 'BAT',  predicted_points: 44.8, credits: 9.5, model_version: '20260101' },
      { player_id: 423838, player_name: 'Deepak Chahar',     team: 'Chennai Super Kings', role: 'BOWL', predicted_points: 38.6, credits: 8.0, model_version: '20260101' },
      { player_id: 543209, player_name: 'Ishan Kishan',      team: 'Mumbai Indians', role: 'WK',   predicted_points: 36.4, credits: 8.5, model_version: '20260101' }
    ]
  },
  'dream-team': {
    upcoming_id: 42, team1: 'Mumbai Indians', team2: 'Chennai Super Kings',
    total_credits: 97.5, projected_score: 724.8,
    lineup: [
      { player_id: 28081,  player_name: 'MS Dhoni',        team: 'Chennai Super Kings', role: 'WK',   predicted_points: 64.2, credits: 9.5,  is_captain: false, is_vice_captain: true  },
      { player_id: 253802, player_name: 'Virat Kohli',      team: 'RCB',                role: 'BAT',  predicted_points: 61.8, credits: 11.0, is_captain: true,  is_vice_captain: false },
      { player_id: 34102,  player_name: 'Rohit Sharma',     team: 'Mumbai Indians',     role: 'BAT',  predicted_points: 58.5, credits: 10.5, is_captain: false, is_vice_captain: false },
      { player_id: 277916, player_name: 'Jasprit Bumrah',   team: 'Mumbai Indians',     role: 'BOWL', predicted_points: 56.1, credits: 10.0, is_captain: false, is_vice_captain: false },
      { player_id: 625383, player_name: 'Ruturaj Gaikwad',  team: 'Chennai Super Kings',role: 'BAT',  predicted_points: 51.3, credits: 9.0,  is_captain: false, is_vice_captain: false },
      { player_id: 481896, player_name: 'Hardik Pandya',    team: 'Mumbai Indians',     role: 'AR',   predicted_points: 49.7, credits: 10.0, is_captain: false, is_vice_captain: false },
      { player_id: 290716, player_name: 'Ravindra Jadeja',  team: 'Chennai Super Kings',role: 'AR',   predicted_points: 47.2, credits: 9.5,  is_captain: false, is_vice_captain: false },
      { player_id: 308967, player_name: 'Suryakumar Yadav', team: 'Mumbai Indians',     role: 'BAT',  predicted_points: 44.8, credits: 9.5,  is_captain: false, is_vice_captain: false },
      { player_id: 423838, player_name: 'Deepak Chahar',    team: 'Chennai Super Kings',role: 'BOWL', predicted_points: 38.6, credits: 8.0,  is_captain: false, is_vice_captain: false },
      { player_id: 543209, player_name: 'Ishan Kishan',     team: 'Mumbai Indians',     role: 'WK',   predicted_points: 36.4, credits: 8.5,  is_captain: false, is_vice_captain: false },
      { player_id: 412004, player_name: 'Tushar Deshpande', team: 'Chennai Super Kings',role: 'BOWL', predicted_points: 31.8, credits: 7.5,  is_captain: false, is_vice_captain: false }
    ]
  },
  'player-form': {
    player_id: 253802, name: 'Virat Kohli', role: 'BAT',
    batting_hand: 'Right hand', bowling_style: null, nationality: 'India',
    matches_last_10: 10, fp_last3_avg: 61.2, fp_last5_avg: 54.8, fp_last10_avg: 49.3,
    fp_std5: 12.4, fp_trend: 'rising', bat_runs_avg5: 44.6, bat_sr_avg5: 142.3,
    bat_boundary_pct5: 0.18, bowl_wkts_avg5: 0.0, bowl_eco_avg5: 0.0,
    recent_scores: [
      { match_id: 41, match_date: '2026-03-18', vs: 'Mumbai Indians vs Delhi Capitals',      total_points: 76.5, batting_points: 68.0, bowling_points: 0.0, fielding_points: 8.5 },
      { match_id: 38, match_date: '2026-03-14', vs: 'RCB vs Rajasthan Royals',               total_points: 48.0, batting_points: 48.0, bowling_points: 0.0, fielding_points: 0.0 },
      { match_id: 35, match_date: '2026-03-10', vs: 'RCB vs Punjab Kings',                   total_points: 62.5, batting_points: 54.0, bowling_points: 0.0, fielding_points: 8.5 },
      { match_id: 31, match_date: '2026-03-06', vs: 'Kolkata Knight Riders vs RCB',          total_points: 41.0, batting_points: 41.0, bowling_points: 0.0, fielding_points: 0.0 },
      { match_id: 28, match_date: '2026-03-02', vs: 'RCB vs Chennai Super Kings',            total_points: 55.0, batting_points: 47.0, bowling_points: 0.0, fielding_points: 8.0 }
    ]
  },
  'player-matchup': {
    player_id: 253802, matchup_type: 'spin', strike_rate: 118.4, economy_rate: null, sample_deliveries: 842
  }
};

// ── Endpoint config ───────────────────────────────────────────────────────────
const ENDPOINTS = [
  {
    id: 'upcoming',
    label: 'Upcoming Matches',
    path: '/v1/matches/upcoming',
    mockKey: 'upcoming',
    params: [
      { name: 'league_id', label: 'League', type: 'text',   placeholder: 'ipl', default: 'ipl', desc: 'Filter by league (ipl, t20i, bbl…)' },
      { name: 'format',    label: 'Format', type: 'select', options: ['', 'T20', 'ODI'], default: 'T20', desc: 'Match format' },
      { name: 'limit',     label: 'Limit',  type: 'number', placeholder: '5',   default: '5',   min: 1, max: 20, desc: 'Max results (1–20)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams();
      if (p.league_id) q.set('league_id', p.league_id);
      if (p.format)    q.set('format', p.format);
      if (p.limit)     q.set('limit', p.limit);
      return `/v1/matches/upcoming?${q}`;
    }
  },
  {
    id: 'prediction',
    label: 'Player Predictions',
    path: '/v1/matches/{id}/prediction',
    mockKey: 'prediction',
    params: [
      { name: 'upcoming_id', label: 'upcoming_id', type: 'number', placeholder: '42', default: '42', desc: 'Match ID from /matches/upcoming' }
    ],
    buildPath(p) { return `/v1/matches/${p.upcoming_id || 42}/prediction`; }
  },
  {
    id: 'dream-team',
    label: 'Predicted XI',
    path: '/v1/matches/{id}/dream-team',
    mockKey: 'dream-team',
    params: [
      { name: 'upcoming_id', label: 'upcoming_id', type: 'number', placeholder: '42', default: '42', desc: 'Match ID from /matches/upcoming' }
    ],
    buildPath(p) { return `/v1/matches/${p.upcoming_id || 42}/dream-team`; }
  },
  {
    id: 'player-form',
    label: 'Player Form',
    path: '/v1/players/{id}/form',
    mockKey: 'player-form',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'ESPNcricinfo player ID (e.g. 253802 = Kohli)' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id || 253802}/form`; }
  },
  {
    id: 'player-matchup',
    label: 'Player Matchup',
    path: '/v1/players/{id}/vs/{type}',
    mockKey: 'player-matchup',
    params: [
      { name: 'player_id',     label: 'player_id',     type: 'number', placeholder: '253802', default: '253802', desc: 'ESPNcricinfo player ID' },
      { name: 'matchup_type',  label: 'matchup_type',  type: 'select', options: ['pace','spin','left-arm'], default: 'spin', desc: 'Bowling category' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id || 253802}/vs/${p.matchup_type || 'spin'}`; }
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
  return document.getElementById('pg-key-input').value.trim() || DEMO_KEY;
}

function isDemo() {
  const k = getApiKey();
  return k === DEMO_KEY || k === '';
}

function buildUrl() {
  return CRICVEDA_API_URL + activeEp.buildPath(getParamValues());
}

function buildCurl() {
  const url = buildUrl();
  const key = isDemo() ? 'cv_demo_readonly' : getApiKey();
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
function updateModeBanner() {
  const banner = document.getElementById('pg-mode-banner');
  if (isDemo()) {
    banner.className = 'pg-mode-banner demo';
    banner.innerHTML = '<span class="pg-mode-dot"></span> Demo mode — responses are illustrative';
  } else {
    banner.className = 'pg-mode-banner live';
    banner.innerHTML = '<span class="pg-mode-dot"></span> Live API — real data';
  }
}

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
      if (p.min) input.min = p.min;
      if (p.max) input.max = p.max;
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

function showResponse(data, status, latency, demo) {
  const bar = document.getElementById('pg-status-bar');
  const ok = status >= 200 && status < 300;
  bar.innerHTML = `
    <span class="pg-status-badge ${ok ? 'ok' : 'err'}">${status}</span>
    <span class="pg-status-latency">${latency}ms</span>
    <span class="pg-status-mode">${demo ? 'demo data' : 'live'}</span>`;

  const body = document.getElementById('pg-response-body');
  if (ok) {
    body.innerHTML = `<pre class="pg-json">${syntaxHighlight(data)}</pre>`;
    const copyBtn = document.getElementById('pg-response-copy');
    if (copyBtn) copyBtn._data = JSON.stringify(data, null, 2);
  } else {
    body.innerHTML = `<div class="pg-error-card"><p>${JSON.stringify(data, null, 2)}</p></div>`;
  }
}

// ── Request runner ────────────────────────────────────────────────────────────
async function runRequest() {
  if (isRunning) return;
  isRunning = true;

  const btn = document.getElementById('pg-run-btn-inline');
  btn.disabled = true;
  btn.innerHTML = '<span class="pg-spinner"></span> Running…';

  const demo = isDemo();
  const t0 = performance.now();

  try {
    if (demo) {
      // Simulate realistic latency
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
      const latency = Math.round(performance.now() - t0);
      showResponse(MOCKS[activeEp.mockKey], 200, latency, true);
    } else {
      const url = buildUrl();
      const res = await fetch(url, {
        headers: { 'X-API-Key': getApiKey() }
      });
      const latency = Math.round(performance.now() - t0);
      let data;
      try { data = await res.json(); } catch { data = { error: 'Non-JSON response' }; }
      showResponse(data, res.status, latency, false);
    }
  } catch (err) {
    const latency = Math.round(performance.now() - t0);
    showResponse({ error: err.message, hint: 'Is the API deployed? Check CRICVEDA_API_URL in playground.js.' }, 0, latency, false);
    document.getElementById('pg-status-bar').innerHTML =
      `<span class="pg-status-badge err">Network Error</span><span class="pg-status-latency">${latency}ms</span>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run';
    isRunning = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Endpoint tab clicks
  document.querySelectorAll('.pg-ep-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = ENDPOINTS.find(e => e.id === btn.dataset.id);
      if (ep) setEndpoint(ep);
    });
  });

  // API key changes
  const keyInput = document.getElementById('pg-key-input');
  keyInput.addEventListener('input', () => {
    updateModeBanner();
    document.getElementById('pg-curl-code').textContent = buildCurl();
  });

  // Clear key button
  document.getElementById('pg-key-clear').addEventListener('click', () => {
    keyInput.value = DEMO_KEY;
    updateModeBanner();
    document.getElementById('pg-curl-code').textContent = buildCurl();
  });

  // Run button
  document.getElementById('pg-run-btn-inline').addEventListener('click', runRequest);

  // Copy curl
  document.getElementById('pg-curl-copy').addEventListener('click', function() {
    copyText(document.getElementById('pg-curl-code').textContent, this);
  });

  // Copy response
  document.getElementById('pg-response-copy').addEventListener('click', function() {
    const pre = document.querySelector('#pg-response-body .pg-json');
    if (pre) copyText(pre.textContent, this);
  });

  // Keyboard shortcut: Ctrl/Cmd + Enter to run
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runRequest();
  });

  // Init
  renderParams();
  updateModeBanner();
  clearResponse();
});
