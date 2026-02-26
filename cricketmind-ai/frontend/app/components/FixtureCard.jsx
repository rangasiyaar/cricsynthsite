'use client';

import { useState } from 'react';
import styles from './FixtureCard.module.css';
import Scorecard from './Scorecard';
import SquadList from './SquadList';
import MatchDetail from './MatchDetail';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const statusClass = {
    upcoming: styles.statusUpcoming,
    live: styles.statusLive,
    finished: styles.statusFinished,
    recent: styles.statusFinished,
};

const cardClass = {
    upcoming: styles.upcoming,
    live: styles.live,
    finished: styles.finished,
    recent: styles.finished,
};

export default function FixtureCard({ fixture, variant = 'upcoming' }) {
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState('info');
    const [detail, setDetail] = useState(null);
    const [scorecard, setScorecard] = useState(null);
    const [squads, setSquads] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        setLoading(true);

        try {
            const [detailRes, scorecardRes, squadsRes] = await Promise.all([
                fetch(`${API}/api/fixtures/${fixture.id}/detail`).then(r => r.json()),
                fetch(`${API}/api/fixtures/${fixture.id}/scorecard`).then(r => r.json()).catch(() => ({ data: null })),
                fetch(`${API}/api/fixtures/${fixture.id}/squads`).then(r => r.json()).catch(() => ({ data: [] })),
            ]);
            setDetail(detailRes.data);
            setScorecard(scorecardRes.data);
            setSquads(squadsRes.data || []);
        } catch (err) {
            console.error('Failed to load fixture details:', err);
        } finally {
            setLoading(false);
        }
    };

    const hasScores = fixture.local_score || fixture.visitor_score;

    return (
        <div>
            <div className={`${styles.card} ${cardClass[variant] || ''}`} onClick={handleClick}>
                <div className={styles.cardTop}>
                    <span className={styles.matchType}>{fixture.matchType || 'T20'}</span>
                    <span className={`${styles.status} ${statusClass[variant] || ''}`}>{fixture.status}</span>
                </div>
                <div className={styles.matchName}>{fixture.name}</div>
                <div className={styles.matchMeta}>
                    <span>{fixture.venue}{fixture.venue_city ? `, ${fixture.venue_city}` : ''}</span>
                    <span>{fixture.date}</span>
                    {fixture.league_name && <span>{fixture.league_name}</span>}
                </div>
                {hasScores && (
                    <div className={styles.scores}>
                        {fixture.teams?.map((team, i) => (
                            <div key={i}>
                                <span className={styles.scoreTeam}>{team}</span>
                                <span className={styles.scoreValue}>
                                    {i === 0 ? fixture.local_score : fixture.visitor_score}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {expanded && (
                <div className={styles.detailPanel}>
                    {loading ? (
                        <p className={styles.noData}>Loading details...</p>
                    ) : (
                        <>
                            <div className={styles.detailTabs}>
                                <button
                                    className={`${styles.detailTab} ${activeTab === 'info' ? styles.detailTabActive : ''}`}
                                    onClick={() => setActiveTab('info')}
                                >Match Info</button>
                                {(variant === 'live' || variant === 'finished' || variant === 'recent') && (
                                    <button
                                        className={`${styles.detailTab} ${activeTab === 'scorecard' ? styles.detailTabActive : ''}`}
                                        onClick={() => setActiveTab('scorecard')}
                                    >Scorecard</button>
                                )}
                                <button
                                    className={`${styles.detailTab} ${activeTab === 'squads' ? styles.detailTabActive : ''}`}
                                    onClick={() => setActiveTab('squads')}
                                >Squad</button>
                            </div>

                            {activeTab === 'info' && detail && <MatchDetail detail={detail} />}
                            {activeTab === 'scorecard' && (
                                scorecard ? <Scorecard data={scorecard} /> : <p className={styles.noData}>Scorecard not available</p>
                            )}
                            {activeTab === 'squads' && (
                                squads && squads.length > 0
                                    ? <SquadList squads={squads} />
                                    : <p className={styles.noData}>Squad data not available yet</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
