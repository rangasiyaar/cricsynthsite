'use client';

import { useState, useEffect } from 'react';
import Hero from './components/Hero';
import FixtureCard from './components/FixtureCard';
import PredictionPanel from './components/PredictionPanel';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'live', label: 'Live' },
  { id: 'recent', label: 'Recent' },
  { id: 'predict', label: 'AI Predict' },
  { id: 'history', label: 'History' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [upcoming, setUpcoming] = useState([]);
  const [live, setLive] = useState([]);
  const [recent, setRecent] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const fetchData = async (endpoint, key, limit) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch(`${API}/api/fixtures/${endpoint}`);
      const data = await res.json();
      let items = data.data || [];
      if (limit) items = items.slice(0, limit);
      return items;
    } catch (err) {
      setErrors(prev => ({ ...prev, [key]: 'Failed to load data. Is the backend running?' }));
      return [];
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const fetchPredictions = async () => {
    setLoading(prev => ({ ...prev, history: true }));
    try {
      const res = await fetch(`${API}/api/predictions`);
      const data = await res.json();
      setPredictions(data.data || []);
    } catch (err) {
      setErrors(prev => ({ ...prev, history: 'Failed to load predictions' }));
    } finally {
      setLoading(prev => ({ ...prev, history: false }));
    }
  };

  useEffect(() => {
    // Load initial data
    fetchData('upcoming', 'upcoming', 5).then(setUpcoming);
    fetchData('live', 'live').then(setLive);
    fetchData('recent', 'recent', 10).then(setRecent);
    fetchPredictions();
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // Refresh data on tab switch
    if (tabId === 'upcoming') fetchData('upcoming', 'upcoming', 5).then(setUpcoming);
    if (tabId === 'live') fetchData('live', 'live').then(setLive);
    if (tabId === 'recent') fetchData('recent', 'recent', 10).then(setRecent);
    if (tabId === 'history') fetchPredictions();
  };

  const renderFixtureList = (fixtures, variant, emptyMsg) => {
    if (loading[variant]) {
      return (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading {variant} fixtures...</p>
        </div>
      );
    }
    if (errors[variant]) {
      return <div className={styles.errorState}>{errors[variant]}</div>;
    }
    if (!fixtures || fixtures.length === 0) {
      return <div className={styles.emptyState}>{emptyMsg}</div>;
    }
    return (
      <div className={styles.fixtureList}>
        {fixtures.map(f => (
          <FixtureCard key={f.id} fixture={f} variant={variant} />
        ))}
      </div>
    );
  };

  return (
    <>
      <Hero />
      <div className={styles.mainContent}>
        <div className={styles.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              {tab.id === 'live' && live.length > 0 && (
                <span className={styles.liveDot} />
              )}
              {tab.id === 'history' && predictions.length > 0 && (
                <span className={styles.badge}>{predictions.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'upcoming' && renderFixtureList(upcoming, 'upcoming', 'No upcoming matches found')}
          {activeTab === 'live' && renderFixtureList(live, 'live', 'No live matches right now')}
          {activeTab === 'recent' && renderFixtureList(recent, 'recent', 'No recent results')}
          {activeTab === 'predict' && <PredictionPanel upcomingFixtures={upcoming} />}
          {activeTab === 'history' && (
            predictions.length > 0
              ? <div className={styles.historyList}>
                {predictions.map((p, i) => (
                  <div key={i} className={styles.historyCard}>
                    <div className={styles.historyTitle}>{p.match_name || p.match_id || `Prediction ${i + 1}`}</div>
                    <div className={styles.historyMeta}>{p.timestamp || p.created_at || ''}</div>
                    {p.summary && <p className={styles.historySummary}>{p.summary}</p>}
                  </div>
                ))}
              </div>
              : <div className={styles.emptyState}>No predictions yet. Run a live prediction first.</div>
          )}
        </div>

        <div className={styles.disclaimer}>
          <p>CricVeda AI 1.0 predictions are for informational/entertainment purposes only. Results may vary. Powered by Sportmonks data and Gemini AI.</p>
        </div>
      </div>
    </>
  );
}
