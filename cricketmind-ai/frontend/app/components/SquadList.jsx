'use client';

import styles from './SquadList.module.css';

export default function SquadList({ squads }) {
    if (!squads || squads.length === 0) {
        return <p className={styles.noData}>Squad data not available yet.</p>;
    }

    return (
        <div className={styles.squadsContainer}>
            {squads.map((squad, i) => {
                const teamName = squad.name || squad.team?.name || `Team ${i + 1}`;
                const players = squad.squad || [];

                return (
                    <div key={i} className={styles.teamCard}>
                        <div className={styles.teamHeader}>
                            <span className={styles.teamName}>{teamName}</span>
                            <span className={styles.playerCount}>{players.length} players</span>
                        </div>
                        <div className={styles.playerGrid}>
                            {players.map((p, j) => {
                                const player = p.player || p;
                                const name = player.fullname || player.firstname || `Player ${j + 1}`;
                                const pos = player.position?.name || p.position || '';
                                const isCaptain = p.captain === true;
                                const isKeeper = p.wicketkeeper === true;

                                return (
                                    <div key={j} className={styles.playerCard}>
                                        <div className={styles.playerName}>
                                            {name}
                                            {isCaptain && <span className={styles.badge}>C</span>}
                                            {isKeeper && <span className={styles.badgeKeeper}>WK</span>}
                                        </div>
                                        {pos && <div className={styles.playerRole}>{pos}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
