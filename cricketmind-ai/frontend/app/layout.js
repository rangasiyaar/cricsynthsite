import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';

export const metadata = {
  title: 'CricVeda AI 1.0 | CricSynthesis',
  description: 'Multi-agent AI system that predicts and ranks all 22 players before any cricket match. Data-driven, real-time, accurate.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
