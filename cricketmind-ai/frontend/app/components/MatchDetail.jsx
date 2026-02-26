'use client';

import styles from './MatchDetail.module.css';

export default function MatchDetail({ detail }) {
    if (!detail) return <p className={styles.noData}>No match details available.</p>;

    const venue = detail.venue || {};
    const league = detail.league || {};
    const season = detail.season || {};
    const localTeam = detail.localteam || {};
    const visitorTeam = detail.visitorteam || {};
    const tossWon = detail.tosswon || null;
    const tossText = detail.elected || '';
    const result = detail.note || detail.result || '';
    const weather = detail.weather_report || [];

    const infoRows = [
        { label: 'Match', value: detail.name || `${localTeam.name || ''} vs ${visitorTeam.name || ''}` },
        { label: 'Format', value: detail.type || '' },
        { label: 'League', value: league.name || '' },
        { label: 'Season', value: season.name || '' },
        { label: 'Venue', value: venue.name || '' },
        { label: 'City', value: venue.city || '' },
        { label: 'Date', value: detail.starting_at || '' },
        { label: 'Status', value: detail.status || '' },
    ];

    if (tossWon) {
        const tossTeamName = tossWon === detail.localteam_id ? (localTeam.name || 'Local') : (visitorTeam.name || 'Visitor');
        infoRows.push({ label: 'Toss', value: `${tossTeamName} won and elected to ${tossText}` });
    }

    if (result) {
        infoRows.push({ label: 'Result', value: result });
    }

    return (
        <div className={styles.detailContainer}>
            <div className={styles.infoGrid}>
                {infoRows
                    .filter(r => r.value)
                    .map((row, i) => (
                        <div key={i} className={styles.infoRow}>
                            <span className={styles.infoLabel}>{row.label}</span>
                            <span className={styles.infoValue}>{row.value}</span>
                        </div>
                    ))}
            </div>

            {weather.length > 0 && (
                <div className={styles.weatherSection}>
                    <div className={styles.sectionLabel}>Weather</div>
                    <div className={styles.weatherGrid}>
                        {weather.map((w, i) => (
                            <div key={i} className={styles.weatherItem}>
                                <span className={styles.weatherLabel}>{w.type || 'Condition'}</span>
                                <span className={styles.weatherValue}>{w.value || '--'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
