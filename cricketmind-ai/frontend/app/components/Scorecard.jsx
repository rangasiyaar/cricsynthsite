'use client';

import styles from './Scorecard.module.css';

export default function Scorecard({ data }) {
    if (!data) return null;

    const batting = data.batting || [];
    const bowling = data.bowling || [];
    const runs = data.runs || [];

    if (!batting.length && !bowling.length && !runs.length) {
        return <p className={styles.noData}>No scorecard data available.</p>;
    }

    // Build innings info from runs
    const inningsInfo = {};
    for (const r of runs) {
        const team = r.team || {};
        const teamName = typeof team === 'object' ? (team.name || `Team ${r.team_id}`) : `Team ${r.team_id}`;
        const key = `${r.team_id}_${r.inning || 1}`;
        inningsInfo[key] = {
            teamName,
            score: r.score || 0,
            wickets: r.wickets || 0,
            overs: r.overs || '',
            inning: r.inning || 1,
            teamId: r.team_id,
        };
    }

    // Group batting/bowling by scoreboard (S1/S2)
    const batByInn = {};
    for (const b of batting) {
        const sb = b.scoreboard || 'S1';
        const inning = typeof sb === 'string' && sb.length >= 2 && !isNaN(sb[1]) ? parseInt(sb[1]) : 1;
        const key = `${b.team_id}_${inning}`;
        if (!batByInn[key]) batByInn[key] = [];
        batByInn[key].push(b);
    }

    const bowlByInn = {};
    for (const bw of bowling) {
        const sb = bw.scoreboard || 'S1';
        const inning = typeof sb === 'string' && sb.length >= 2 && !isNaN(sb[1]) ? parseInt(sb[1]) : 1;
        const key = `${bw.team_id}_${inning}`;
        if (!bowlByInn[key]) bowlByInn[key] = [];
        bowlByInn[key].push(bw);
    }

    const innOrder = Object.keys(inningsInfo).sort((a, b) => {
        const ia = inningsInfo[a], ib = inningsInfo[b];
        return (ia.inning - ib.inning) || (ia.teamId - ib.teamId);
    });

    if (!innOrder.length) {
        const allKeys = [...new Set([...Object.keys(batByInn), ...Object.keys(bowlByInn)])];
        innOrder.push(...allKeys.sort());
    }

    return (
        <div className={styles.scorecard}>
            {innOrder.map(key => {
                const info = inningsInfo[key] || {};
                const teamName = info.teamName || `Team ${key.split('_')[0]}`;
                const score = info.score !== undefined ? `${info.score}/${info.wickets}` : '';
                const overs = info.overs ? ` (${info.overs} ov)` : '';
                const innLabel = (info.inning || 1) === 1 ? '1st Innings' : '2nd Innings';
                const batList = batByInn[key] || [];
                const bowlList = bowlByInn[key] || [];

                // Extras
                let totalWides = 0, totalNoballs = 0;
                for (const bw of bowlList) {
                    totalWides += bw.wide || 0;
                    totalNoballs += bw.noball || 0;
                }
                const totalExtras = totalWides + totalNoballs;

                return (
                    <div key={key} className={styles.inningsCard}>
                        <div className={styles.inningsHeader}>
                            <div>
                                <span className={styles.teamName}>{teamName}</span>
                                <span className={styles.innLabel}>{innLabel}</span>
                            </div>
                            <span className={styles.totalScore}>{score}{overs}</span>
                        </div>

                        {batList.length > 0 && (
                            <>
                                <div className={styles.sectionLabel}>Batting</div>
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batList.map((b, i) => {
                                                const batsman = b.batsman || {};
                                                const name = typeof batsman === 'object' ? (batsman.fullname || `Player ${b.player_id}`) : `Player ${b.player_id}`;
                                                return (
                                                    <tr key={i}>
                                                        <td className={styles.playerName}>{name}</td>
                                                        <td className={styles.runs}>{b.score || 0}</td>
                                                        <td>{b.ball || 0}</td>
                                                        <td>{b.four_x || 0}</td>
                                                        <td>{b.six_x || 0}</td>
                                                        <td className={styles.dim}>{b.rate || 0}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {bowlList.length > 0 && (
                            <>
                                <div className={styles.sectionLabel}>Bowling</div>
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bowlList.map((bw, i) => {
                                                const bowler = bw.bowler || {};
                                                const name = typeof bowler === 'object' ? (bowler.fullname || `Player ${bw.player_id}`) : `Player ${bw.player_id}`;
                                                return (
                                                    <tr key={i}>
                                                        <td className={styles.playerName}>{name}</td>
                                                        <td>{bw.overs || 0}</td>
                                                        <td>{bw.medians || 0}</td>
                                                        <td>{bw.runs || 0}</td>
                                                        <td className={styles.wickets}>{bw.wickets || 0}</td>
                                                        <td className={styles.dim}>{bw.rate || 0}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {totalExtras > 0 && (
                            <div className={styles.extras}>
                                <span className={styles.dim}>Extras</span>
                                <span className={styles.extrasValue}>{totalExtras}</span>
                                <span className={styles.extrasDetail}>
                                    ({[totalWides && `w ${totalWides}`, totalNoballs && `nb ${totalNoballs}`].filter(Boolean).join(', ')})
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
