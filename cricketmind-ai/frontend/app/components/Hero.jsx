import styles from './Hero.module.css';

export default function Hero() {
    return (
        <section className={styles.hero}>
            <div className={styles.background}>
                <div className={styles.gridOverlay} />
                <div className={`${styles.orb} ${styles.orb1}`} />
                <div className={`${styles.orb} ${styles.orb2}`} />
            </div>

            <div className={styles.content}>
                <div className={styles.badge}>
                    <span className={styles.badgeDot} />
                    <span className={styles.badgeText}>Live Intelligence</span>
                </div>

                <h1 className={styles.title}>
                    CricVeda AI 1.0<br />
                    <span className={styles.titleSub}>powered by <span className="gradient-text">CricSynthesis</span></span>
                </h1>

                <p className={styles.subtitle}>
                    Multi-agent AI system that predicts and ranks all 22 players before any cricket match. Data-driven. Real-time. Accurate.
                </p>

                <div className={styles.metricsBar}>
                    <div className={styles.metric}>
                        <div className={styles.metricValue}>15,000</div>
                        <div className={styles.metricLabel}>Matches Analysed</div>
                    </div>
                    <div className={styles.metricDivider} />
                    <div className={styles.metric}>
                        <div className={styles.metricValue}>4</div>
                        <div className={styles.metricLabel}>AI Agents</div>
                    </div>
                    <div className={styles.metricDivider} />
                    <div className={styles.metric}>
                        <div className={styles.metricValue}>Live</div>
                        <div className={styles.metricLabel}>Data Feed</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
