'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const CRICVEDA_API_URL = 'https://api.cricsynthesis.in';

// ── Mock responses ─────────────────────────────────────────────────────────────
const MOCKS = {
  'win-probability': {
    win_probability: 0.42, runs_needed: 80, balls_remaining: 60, required_rr: 8.0,
    blueprint: [
      { over: 12, target_runs_by_end: 96 },
      { over: 15, target_runs_by_end: 120 },
      { over: 18, target_runs_by_end: 144 }
    ],
    sample_size: 312, confidence: 'high'
  },
  'collapse-probability': {
    collapse_probability: 0.28, definition: '3+ wickets in next 30 balls',
    most_common_trigger: 'caught', expected_runs_if_collapse: 32.4,
    expected_runs_if_no_collapse: 67.1, sample_size: 186, confidence: 'medium'
  },
  'momentum': {
    player_id: 253802, momentum_score: 7.8, signal: 'hot',
    matches_in_window: 8, days_since_last_match: 3,
    recent_activity: [
      { match_date: '2026-07-10', league_id: 't20i', total_points: 74.5, z_score: 1.82, weight: 0.91 },
      { match_date: '2026-07-06', league_id: 'ipl',  total_points: 61.0, z_score: 1.24, weight: 0.87 },
      { match_date: '2026-07-01', league_id: 'ipl',  total_points: 48.5, z_score: 0.74, weight: 0.81 },
      { match_date: '2026-06-26', league_id: 't20i', total_points: 82.0, z_score: 2.10, weight: 0.74 },
      { match_date: '2026-06-22', league_id: 'bbl',  total_points: 55.0, z_score: 1.12, weight: 0.68 }
    ]
  },
  'clutch': {
    player_id: 253802, clutch_batting_sr: 148.6, clutch_batting_avg: 34.2,
    clutch_bowling_economy: null, clutch_deliveries: 184,
    clutch_index: 8.2, signal: 'elite_clutch'
  },
  'phase-profile': {
    player_id: 253802, format: 'T20',
    powerplay: { sr: 128.4, avg: 31.2, boundary_pct: 0.22, dot_pct: 0.38, dismissal_rate_per_100: 8.1 },
    middle:    { sr: 118.0, avg: 34.5, boundary_pct: 0.18, dot_pct: 0.42, dismissal_rate_per_100: 6.3 },
    death:     { sr: 162.4, avg: 22.0, boundary_pct: 0.31, dot_pct: 0.28, dismissal_rate_per_100: 12.4 },
    acceleration_score: 34.0, player_type: 'finisher'
  },
  'pressure-fingerprint': {
    player_id: 277916, economy: 6.8, dot_pct: 0.51, maiden_rate: 0.09,
    avg_consecutive_dots: 3.8, max_dot_streak_ever: 18,
    wicket_after_boundary_rate: 0.22, pressure_score: 8.6, archetype: 'strangler'
  },
  'dismissal-map': {
    player_id: 253802, total_dismissals: 142, most_common_dismissal: 'caught',
    danger_zone_phase: 'powerplay',
    by_phase: {
      powerplay: { caught: 12, bowled: 8, lbw: 6, 'run out': 2, stumped: 0, other: 1, dismissal_rate_per_100: 11.2 },
      middle:    { caught: 38, bowled: 14, lbw: 9, 'run out': 4, stumped: 2, other: 2, dismissal_rate_per_100: 6.8 },
      death:     { caught: 22, bowled: 5,  lbw: 4, 'run out': 8, stumped: 1, other: 2, dismissal_rate_per_100: 13.1 }
    }
  },
  'nemesis': {
    player_id: 253802, role: 'batter',
    nemesis_list: [
      { opponent_id: 277916, opponent_name: 'Jasprit Bumrah', balls: 48, dismissals_or_runs: 5, rate: 1.04, label: 'dismissed every 9.6 balls' },
      { opponent_id: 322890, opponent_name: 'Rashid Khan',    balls: 36, dismissals_or_runs: 3, rate: 0.83, label: 'dismissed every 12 balls' },
      { opponent_id: 290716, opponent_name: 'Ravindra Jadeja',balls: 44, dismissals_or_runs: 3, rate: 0.68, label: 'dismissed every 14.7 balls' }
    ]
  },
  'consistency': {
    player_id: 253802, matches_analyzed: 34, mean_fp: 52.4, std_fp: 14.8,
    cv: 0.28, floor_fp: 28.0, ceiling_fp: 78.5, risk_profile: 'safe', upside_ratio: 1.50
  },
  'win-contribution': {
    player_id: 253802, matches: 28, wins: 18, win_rate: 0.64,
    mean_fp_in_wins: 61.4, mean_fp_in_losses: 38.2, wci_score: 74.8,
    high_leverage_matches: 11, winning_in_high_leverage_pct: 0.73
  },
  'scoring-rhythm': {
    player_id: 253802, avg_dot_streak_length: 2.4, boundary_clustering_score: 1.8,
    acceleration_curve: {
      balls_1_10: 118.4, balls_11_20: 134.2, balls_21_30: 156.8, balls_31_40: 162.1, balls_40_plus: 148.5
    },
    player_archetype: 'slow-starter', ignition_point: 'balls_21_30', innings_analyzed: 84
  },
  'milestone-behaviour': {
    player_id: 253802, overall_sr: 138.6,
    milestone_behaviour: {
      approaching_25:  { sr: 122.4, sr_delta: -16.2, sample: 68 },
      approaching_50:  { sr: 141.8, sr_delta:   3.2, sample: 34 },
      approaching_100: { sr: 156.2, sr_delta:  17.6, sample: 12 }
    },
    conversion_rates: { '25_to_50': 0.50, '50_to_100': 0.35 }, label: 'unaffected'
  },
  'league-adjusted-performance': {
    player_id: 253802, overall_adjusted_score: 1.42,
    league_breakdown: [
      { league_id: 'ipl',   league_name: 'Indian Premier League', matches: 18, raw_avg_fp: 52.4, z_score: 1.48, difficulty_multiplier: 1.5 },
      { league_id: 't20i',  league_name: "Men's T20 Internationals", matches: 14, raw_avg_fp: 61.2, z_score: 1.62, difficulty_multiplier: 1.4 },
      { league_id: 'blast', league_name: 'Vitality T20 Blast',    matches: 12, raw_avg_fp: 71.2, z_score: 1.12, difficulty_multiplier: 0.8 }
    ],
    inflation_index: -0.36, label: 'consistent'
  },
  'position-analysis': {
    player_id: 253802,
    by_position: {
      '3': { matches: 22, avg_sr: 142.8, avg_runs: 44.2 },
      '4': { matches: 8,  avg_sr: 118.4, avg_runs: 32.1 }
    },
    optimal_position: 3, current_season_position: 3
  },
  'inherited-pressure': {
    player_id: 253802,
    by_state: {
      clean_start:     { innings: 28, avg_sr: 142.6, avg_runs: 46.2 },
      slight_pressure: { innings: 18, avg_sr: 138.4, avg_runs: 38.8 },
      crisis:          { innings: 12, avg_sr: 124.2, avg_runs: 28.4 },
      rescue_mission:  { innings: 4,  avg_sr: 118.0, avg_runs: 22.1 }
    },
    best_state: 'clean_start', crisis_delta: -18.4
  },
  'format-switch-impact': {
    player_id: 253802, switch_matches: 14, settled_matches: 28,
    switch_avg_z: 0.68, settled_avg_z: 1.24, performance_delta: -0.56,
    worst_switch_direction: 'ODI_to_T20', format_adaptability_score: 0.55, verdict: 'slight-impact'
  },
  'spell-analysis': {
    player_id: 277916,
    by_spell: {
      spell_1: { matches: 38, avg_economy: 6.2, avg_wickets: 1.4, avg_balls: 14.2 },
      spell_2: { matches: 28, avg_economy: 7.1, avg_wickets: 0.9, avg_balls: 8.8 },
      spell_3: { matches: 12, avg_economy: 6.8, avg_wickets: 1.2, avg_balls: 5.4 }
    },
    spell_decay: 0.6, best_spell: 1, verdict: 'frontloader'
  },
  'scoring-zones': {
    player_id: 253802,
    scoring_zones: {
      balls_1_10:    { sr: 118.4, boundary_pct: 0.18, runs: 682, balls: 576 },
      balls_11_20:   { sr: 134.2, boundary_pct: 0.22, runs: 528, balls: 394 },
      balls_21_30:   { sr: 156.8, boundary_pct: 0.28, runs: 412, balls: 263 },
      balls_31_40:   { sr: 162.1, boundary_pct: 0.30, runs: 244, balls: 151 },
      balls_40_plus: { sr: 148.5, boundary_pct: 0.26, runs: 112, balls: 75 }
    },
    ignition_point: 'balls_21_30', peak_zone: 'balls_31_40', innings_analyzed: 84
  },
  'toss-intelligence': {
    venue_id: 2, venue_name: 'Wankhede Stadium', format: 'T20', total_matches: 64,
    batting_first_win_pct: 0.42, fielding_first_win_pct: 0.58,
    toss_alpha: 0.14, best_toss_decision: 'field',
    win_rate_when_winning_toss: 0.62, confidence: 'high'
  },
  'day-night-analysis': {
    venue_id: 2, venue_name: 'Wankhede Stadium', total_matches: 64,
    batting_second_win_pct: 0.58, death_overs_1st_innings_rr: 9.8,
    death_overs_2nd_innings_rr: 11.4, dew_factor_score: 6.2,
    dew_effect_interpretation: 'Significant dew advantage for teams batting second — death-over run rate is 16% higher in the 2nd innings.',
    strongest_effect_phase: 'overs_17-20'
  },
  'batting-depth': {
    team_name: 'India', matches_analyzed: 28, avg_team_total: 168.4,
    top_order_pct: 0.58, middle_order_pct: 0.32, lower_order_pct: 0.10,
    depth_score: 4.2, top_order_reliance: 'medium'
  },
  'pitch-reading': {
    match_id: 12345, overs_analyzed: 3, classification: 'pace-friendly',
    confidence: 'high', actual_run_rate: 6.8, wickets_in_sample: 4,
    wicket_types: { bowled: 2, lbw: 1, caught: 1 }, pace_indicator: 0.75,
    vs_venue_baseline: 'below',
    interpretation: '4 wickets in 3 overs with 3 bowled/LBW suggests significant seam and swing movement.'
  },
  'momentum-curve': {
    match_id: 12345, team1: 'India', team2: 'Australia', winner: 'India',
    total_deliveries: 238,
    curve: [
      { delivery_num: 1,   innings: 1, over_ball: 0.1, event: 'dot',      runs_this_ball: 0, wicket_type: null,     wp_batting_team: 0.50, wp_delta:  0.00 },
      { delivery_num: 24,  innings: 1, over_ball: 3.6, event: 'wicket',   runs_this_ball: 0, wicket_type: 'bowled', wp_batting_team: 0.42, wp_delta: -0.08 },
      { delivery_num: 72,  innings: 1, over_ball: 11.4,event: 'boundary', runs_this_ball: 6, wicket_type: null,     wp_batting_team: 0.55, wp_delta:  0.06 },
      { delivery_num: 108, innings: 2, over_ball: 17.4,event: 'boundary', runs_this_ball: 6, wicket_type: null,     wp_batting_team: 0.78, wp_delta:  0.18 }
    ],
    turning_point: { delivery_num: 108, innings: 2, over_ball: 17.4, event: 'boundary', runs_this_ball: 6, wicket_type: null, wp_batting_team: 0.78, wp_delta: 0.18 },
    top_momentum_swings: [
      { delivery_num: 108, innings: 2, over_ball: 17.4, event: 'boundary', runs_this_ball: 6, wicket_type: null, wp_batting_team: 0.78, wp_delta: 0.18 },
      { delivery_num: 24,  innings: 1, over_ball: 3.6,  event: 'wicket',   runs_this_ball: 0, wicket_type: 'bowled', wp_batting_team: 0.42, wp_delta: -0.08 }
    ]
  },
  'final-over-specialists': {
    league_id: 'ipl', season: '2024', role: 'bowler', over_analyzed: '20th over (T20)',
    specialists: [
      { player_id: 277916, name: 'Jasprit Bumrah',  balls: 42, economy: 5.14, wickets: 8 },
      { player_id: 419898, name: 'Arshdeep Singh',  balls: 36, economy: 7.33, wickets: 5 },
      { player_id: 290716, name: 'Ravindra Jadeja', balls: 28, economy: 7.71, wickets: 3 },
      { player_id: 322890, name: 'Rashid Khan',      balls: 24, economy: 6.50, wickets: 4 },
      { player_id: 481896, name: 'Hardik Pandya',   balls: 18, economy: 8.33, wickets: 2 }
    ]
  },
  'optimal-bowler': {
    batter_id: 253802, batter_name: 'Virat Kohli',
    ranked_bowlers: [
      { player_id: 277916, name: 'Jasprit Bumrah',  balls_faced: 48, runs: 38, dismissals: 5, sr_conceded: 79.2,  dismissal_rate: 1.04, confidence: 'high',   rank: 1 },
      { player_id: 322890, name: 'Rashid Khan',      balls_faced: 36, runs: 42, dismissals: 3, sr_conceded: 116.7, dismissal_rate: 0.83, confidence: 'high',   rank: 2 },
      { player_id: 290716, name: 'Ravindra Jadeja',  balls_faced: 22, runs: 28, dismissals: 1, sr_conceded: 127.3, dismissal_rate: 0.45, confidence: 'medium', rank: 3 }
    ],
    recommendation: 'Jasprit Bumrah is the best choice — 5 dismissals in 48 balls (1 every 9.6 balls) with SR conceded of just 79.2.',
    caveat: null
  }
};

// ── Endpoint config ────────────────────────────────────────────────────────────
const ENDPOINTS = [
  // ── Oracle ──
  {
    id: 'win-probability',
    label: 'Win Probability',
    path: '/v1/oracle/win-probability',
    mockKey: 'win-probability',
    params: [
      { name: 'format',  label: 'format',  type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' },
      { name: 'innings', label: 'innings', type: 'number', placeholder: '2',   default: '2',   min: 1, max: 2,  desc: '1 or 2' },
      { name: 'over',    label: 'over',    type: 'number', placeholder: '10',  default: '10',  min: 1, max: 50, desc: 'Current over' },
      { name: 'wickets', label: 'wickets', type: 'number', placeholder: '3',   default: '3',   min: 0, max: 10, desc: 'Wickets fallen' },
      { name: 'runs',    label: 'runs',    type: 'number', placeholder: '80',  default: '80',  min: 0, desc: 'Runs scored so far' },
      { name: 'target',  label: 'target',  type: 'number', placeholder: '160', default: '160', min: 1, desc: 'Target (innings 2 only)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ format: p.format||'T20', innings: p.innings||'2', over: p.over||'10', wickets: p.wickets||'3', runs: p.runs||'80' });
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
      { name: 'format',  label: 'format',  type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' },
      { name: 'innings', label: 'innings', type: 'number', placeholder: '1',  default: '1',  min: 1, max: 2,  desc: '1 or 2' },
      { name: 'over',    label: 'over',    type: 'number', placeholder: '8',  default: '8',  min: 1, max: 50, desc: 'Current over' },
      { name: 'wickets', label: 'wickets', type: 'number', placeholder: '2',  default: '2',  min: 0, max: 10, desc: 'Wickets fallen' },
      { name: 'score',   label: 'score',   type: 'number', placeholder: '65', default: '65', min: 0, desc: 'Current score' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ format: p.format||'T20', innings: p.innings||'1', over: p.over||'8', wickets: p.wickets||'2', score: p.score||'65' });
      return `/v1/oracle/collapse-probability?${q}`;
    }
  },
  // ── Players ──
  {
    id: 'momentum',
    label: 'Momentum',
    path: '/v1/players/{id}/momentum',
    mockKey: 'momentum',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'days',      label: 'days',      type: 'number', placeholder: '60',     default: '60',     min: 7, max: 180, desc: 'Look-back window in days' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/momentum?days=${p.days||60}`; }
  },
  {
    id: 'clutch',
    label: 'Clutch Score',
    path: '/v1/players/{id}/clutch',
    mockKey: 'clutch',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024',   default: '',       desc: 'Filter by season (optional)' }
    ],
    buildPath(p) {
      const qs = p.season ? `?season=${p.season}` : '';
      return `/v1/players/${p.player_id||253802}/clutch${qs}`;
    }
  },
  {
    id: 'phase-profile',
    label: 'Phase Profile',
    path: '/v1/players/{id}/phase-profile',
    mockKey: 'phase-profile',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/phase-profile?format=${p.format||'T20'}`; }
  },
  {
    id: 'pressure-fingerprint',
    label: 'Pressure Fingerprint',
    path: '/v1/players/{id}/pressure-fingerprint',
    mockKey: 'pressure-fingerprint',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '277916', default: '277916', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||277916}/pressure-fingerprint?format=${p.format||'T20'}`; }
  },
  {
    id: 'dismissal-map',
    label: 'Dismissal Map',
    path: '/v1/players/{id}/dismissal-map',
    mockKey: 'dismissal-map',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/dismissal-map?format=${p.format||'T20'}`; }
  },
  {
    id: 'nemesis',
    label: 'Nemesis',
    path: '/v1/players/{id}/nemesis',
    mockKey: 'nemesis',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'role',      label: 'role',      type: 'select', options: ['batter','bowler'], default: 'batter', desc: 'batter = find nemesis bowlers; bowler = find batters who own them' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/nemesis?role=${p.role||'batter'}`; }
  },
  {
    id: 'consistency',
    label: 'Consistency Score',
    path: '/v1/players/{id}/consistency',
    mockKey: 'consistency',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['','T20','ODI'], default: 'T20', desc: 'Format (optional)' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024', default: '', desc: 'Season (optional)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams();
      if (p.format) q.set('format', p.format);
      if (p.season) q.set('season', p.season);
      const qs = q.toString() ? `?${q}` : '';
      return `/v1/players/${p.player_id||253802}/consistency${qs}`;
    }
  },
  {
    id: 'win-contribution',
    label: 'Win Contribution',
    path: '/v1/players/{id}/win-contribution',
    mockKey: 'win-contribution',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024', default: '', desc: 'Season (optional)' }
    ],
    buildPath(p) {
      const qs = p.season ? `?season=${p.season}` : '';
      return `/v1/players/${p.player_id||253802}/win-contribution${qs}`;
    }
  },
  {
    id: 'scoring-rhythm',
    label: 'Scoring Rhythm',
    path: '/v1/players/{id}/scoring-rhythm',
    mockKey: 'scoring-rhythm',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/scoring-rhythm?format=${p.format||'T20'}`; }
  },
  {
    id: 'milestone-behaviour',
    label: 'Milestone Behaviour',
    path: '/v1/players/{id}/milestone-behaviour',
    mockKey: 'milestone-behaviour',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/milestone-behaviour?format=${p.format||'T20'}`; }
  },
  {
    id: 'league-adjusted-performance',
    label: 'League-Adjusted Performance',
    path: '/v1/players/{id}/league-adjusted-performance',
    mockKey: 'league-adjusted-performance',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/league-adjusted-performance`; }
  },
  {
    id: 'position-analysis',
    label: 'Position Analysis',
    path: '/v1/players/{id}/position-analysis',
    mockKey: 'position-analysis',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/position-analysis?format=${p.format||'T20'}`; }
  },
  {
    id: 'inherited-pressure',
    label: 'Inherited Pressure',
    path: '/v1/players/{id}/inherited-pressure',
    mockKey: 'inherited-pressure',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/inherited-pressure?format=${p.format||'T20'}`; }
  },
  {
    id: 'format-switch-impact',
    label: 'Format Switch Impact',
    path: '/v1/players/{id}/format-switch-impact',
    mockKey: 'format-switch-impact',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/format-switch-impact`; }
  },
  {
    id: 'spell-analysis',
    label: 'Spell Analysis',
    path: '/v1/players/{id}/spell-analysis',
    mockKey: 'spell-analysis',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '277916', default: '277916', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||277916}/spell-analysis?format=${p.format||'T20'}`; }
  },
  {
    id: 'scoring-zones',
    label: 'Scoring Zones',
    path: '/v1/players/{id}/scoring-zones',
    mockKey: 'scoring-zones',
    params: [
      { name: 'player_id', label: 'player_id', type: 'number', placeholder: '253802', default: '253802', desc: 'Player registry ID' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/players/${p.player_id||253802}/scoring-zones?format=${p.format||'T20'}`; }
  },
  // ── Venues ──
  {
    id: 'toss-intelligence',
    label: 'Toss Intelligence',
    path: '/v1/venues/{id}/toss-intelligence',
    mockKey: 'toss-intelligence',
    params: [
      { name: 'venue_id', label: 'venue_id', type: 'number', placeholder: '2',   default: '2',   desc: 'Venue ID' },
      { name: 'format',   label: 'format',   type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/venues/${p.venue_id||2}/toss-intelligence?format=${p.format||'T20'}`; }
  },
  {
    id: 'day-night-analysis',
    label: 'Day/Night Analysis',
    path: '/v1/venues/{id}/day-night-analysis',
    mockKey: 'day-night-analysis',
    params: [
      { name: 'venue_id', label: 'venue_id', type: 'number', placeholder: '2',   default: '2',   desc: 'Venue ID' },
      { name: 'format',   label: 'format',   type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' }
    ],
    buildPath(p) { return `/v1/venues/${p.venue_id||2}/day-night-analysis?format=${p.format||'T20'}`; }
  },
  // ── Teams ──
  {
    id: 'batting-depth',
    label: 'Batting Depth',
    path: '/v1/teams/{name}/batting-depth',
    mockKey: 'batting-depth',
    params: [
      { name: 'team_name', label: 'team_name', type: 'text',   placeholder: 'India', default: 'India', desc: 'Team name (URL-encoded)' },
      { name: 'format',    label: 'format',    type: 'select', options: ['T20','ODI'], default: 'T20', desc: 'Match format' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024', default: '2024', desc: 'Season (optional)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ format: p.format||'T20' });
      if (p.season) q.set('season', p.season);
      return `/v1/teams/${encodeURIComponent(p.team_name||'India')}/batting-depth?${q}`;
    }
  },
  // ── Matches ──
  {
    id: 'pitch-reading',
    label: 'Pitch Reading',
    path: '/v1/matches/{id}/pitch-reading',
    mockKey: 'pitch-reading',
    params: [
      { name: 'match_id',   label: 'match_id',   type: 'number', placeholder: '12345', default: '12345', desc: 'Historical match ID' },
      { name: 'after_over', label: 'after_over',  type: 'number', placeholder: '3',     default: '3',     min: 1, max: 10, desc: 'Read pitch after N overs' }
    ],
    buildPath(p) { return `/v1/matches/${p.match_id||12345}/pitch-reading?after_over=${p.after_over||3}`; }
  },
  {
    id: 'momentum-curve',
    label: 'Momentum Curve',
    path: '/v1/matches/{id}/momentum-curve',
    mockKey: 'momentum-curve',
    params: [
      { name: 'match_id', label: 'match_id', type: 'number', placeholder: '12345', default: '12345', desc: 'Historical match ID' }
    ],
    buildPath(p) { return `/v1/matches/${p.match_id||12345}/momentum-curve`; }
  },
  // ── Leaderboards ──
  {
    id: 'final-over-specialists',
    label: 'Final Over Specialists',
    path: '/v1/leagues/{id}/final-over-specialists',
    mockKey: 'final-over-specialists',
    params: [
      { name: 'league_id', label: 'league_id', type: 'text',   placeholder: 'ipl',    default: 'ipl',    desc: 'League (ipl, t20i, bbl, psl…)' },
      { name: 'season',    label: 'season',    type: 'text',   placeholder: '2024',   default: '2024',   desc: 'Season year' },
      { name: 'role',      label: 'role',      type: 'select', options: ['bowler','batter'], default: 'bowler', desc: 'bowler or batter' },
      { name: 'limit',     label: 'limit',     type: 'number', placeholder: '10', default: '10', min: 1, max: 25, desc: 'Max results' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ role: p.role||'bowler', limit: p.limit||'10' });
      if (p.season) q.set('season', p.season);
      return `/v1/leagues/${p.league_id||'ipl'}/final-over-specialists?${q}`;
    }
  },
  // ── Matchups ──
  {
    id: 'optimal-bowler',
    label: 'Optimal Bowler',
    path: '/v1/matchups/optimal-bowler',
    mockKey: 'optimal-bowler',
    params: [
      { name: 'batter_id',  label: 'batter_id',  type: 'number', placeholder: '253802', default: '253802', desc: 'Batter player ID' },
      { name: 'bowler_ids', label: 'bowler_ids', type: 'text',   placeholder: '277916,290716,322890', default: '277916,290716,322890', desc: 'Comma-separated bowler IDs (max 10)' },
      { name: 'format',     label: 'format',     type: 'select', options: ['','T20','ODI'], default: 'T20', desc: 'Format (optional)' }
    ],
    buildPath(p) {
      const q = new URLSearchParams({ batter_id: p.batter_id||253802, bowler_ids: p.bowler_ids||'277916,290716,322890' });
      if (p.format) q.set('format', p.format);
      return `/v1/matchups/optimal-bowler?${q}`;
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
      showResponse(MOCKS[activeEp.mockKey], 200, Math.round(performance.now() - t0));
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
    showResponse(MOCKS[activeEp.mockKey], 200, Math.round(performance.now() - t0));
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
