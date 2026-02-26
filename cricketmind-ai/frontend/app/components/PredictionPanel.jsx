'use client';

import { useState } from 'react';
import styles from './PredictionPanel.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function PredictionPanel({ upcomingFixtures }) {
    const [selectedId, setSelectedId] = useState('');
    const [prediction, setPrediction] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const selectedMatch = upcomingFixtures?.find(f => String(f.id) === selectedId);

    const runPrediction = async () => {
        if (!selectedId) return;
        setLoading(true);
        setError('');
        setPrediction(null);

        try {
            const res = await fetch(`${API}/api/predict/${selectedId}`, { method: 'POST' });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setPrediction(data);
        } catch (err) {
            setError(err.message || 'Prediction failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.panel}>
            <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>AI Player Rankings</h2>
                <p className={styles.sectionSub}>Select a match for multi-agent prediction</p>
            </div>

            {!upcomingFixtures || upcomingFixtures.length === 0 ? (
                <div className={styles.emptyState}>No upcoming matches available for prediction</div>
            ) : (
                <>
                    <div className={styles.controlRow}>
                        <select
                            className={styles.select}
                            value={selectedId}
                            onChange={e => setSelectedId(e.target.value)}
                        >
                            <option value="">Select a match</option>
                            {upcomingFixtures.slice(0, 10).map(f => (
                                <option key={f.id} value={String(f.id)}>
                                    {f.name} -- {f.matchType} -- {f.date}
                                </option>
                            ))}
                        </select>

                        <button
                            className={styles.predictBtn}
                            onClick={runPrediction}
                            disabled={!selectedId || loading}
                        >
                            {loading ? 'Running AI Pipeline...' : 'Predict and Rank Players'}
                        </button>
                    </div>

                    {selectedMatch && (
                        <div className={styles.matchInfo}>
                            <div className={styles.infoChip}>{selectedMatch.matchType || 'T20'}</div>
                            <div className={styles.infoChip}>{selectedMatch.venue || 'TBC'}</div>
                            <div className={styles.infoChip}>{selectedMatch.date || ''}</div>
                        </div>
                    )}
                </>
            )}

            {loading && (
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p className={styles.loadingText}>Running AI pipeline -- this may take 1-2 minutes</p>
                    <p className={styles.loadingSub}>4 AI agents are analysing form, matchups, conditions, and rankings</p>
                </div>
            )}

            {error && (
                <div className={styles.errorState}>
                    <p className={styles.errorText}>{error}</p>
                </div>
            )}

            {prediction && <PredictionResult data={prediction} />}
        </div>
    );
}

function PredictionResult({ data }) {
    const rankings = data.rankings || data.player_rankings || [];
    const summary = data.summary || data.match_summary || '';
    const confidence = data.confidence || data.confidence_score || null;

    return (
        <div className={styles.result}>
            {summary && (
                <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Match Analysis</div>
                    <p className={styles.summaryText}>{summary}</p>
                    {confidence && (
                        <div className={styles.confidenceBadge}>
                            Confidence: {typeof confidence === 'number' ? `${(confidence * 100).toFixed(0)}%` : confidence}
                        </div>
                    )}
                </div>
            )}

            {rankings.length > 0 && (
                <div className={styles.rankingsSection}>
                    <div className={styles.rankingsHeader}>Player Rankings</div>
                    <div className={styles.rankingsGrid}>
                        {rankings.map((player, i) => (
                            <div key={i} className={`${styles.rankCard} ${i < 3 ? styles.topRank : ''}`}>
                                <div className={styles.rankNumber}>#{i + 1}</div>
                                <div className={styles.rankInfo}>
                                    <div className={styles.rankName}>{player.name || player.player_name || `Player ${i + 1}`}</div>
                                    <div className={styles.rankRole}>{player.role || player.position || ''}</div>
                                    {player.team && <div className={styles.rankTeam}>{player.team}</div>}
                                </div>
                                <div className={styles.rankScore}>
                                    {player.score !== undefined ? player.score : player.rating || '--'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!rankings.length && !summary && (
                <div className={styles.rawResult}>
                    <pre className={styles.rawPre}>{JSON.stringify(data, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
