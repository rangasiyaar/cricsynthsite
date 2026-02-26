import Image from 'next/image';
import styles from './Header.module.css';

export default function Header() {
    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <a href="https://cricsynthesis.in" target="_blank" rel="noopener noreferrer" className={styles.logo}>
                    <Image src="/logo.png" alt="CricSynthesis" width={252} height={72} className={styles.logoImage} priority />
                </a>
                <nav className={styles.nav}>
                    <a href="https://cricsynthesis.in" target="_blank" rel="noopener noreferrer" className={styles.navLink}>Home</a>
                    <a href="https://cricsynthesis.in#features" target="_blank" rel="noopener noreferrer" className={styles.navLink}>Capabilities</a>
                    <a href="https://cricsynthesis.in#solutions" target="_blank" rel="noopener noreferrer" className={styles.navLink}>Solutions</a>
                    <span className={styles.activeLink}>CricVeda AI 1.0</span>
                </nav>
            </div>
        </header>
    );
}
