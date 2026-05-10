import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CricVeda — Fantasy Cricket Intelligence API | CricSynthesis',
  description: 'AI-powered cricket analytics API for fantasy sports. Form scores, matchup analysis, dream teams, venue intelligence, and more across 13+ T20 leagues.',
  openGraph: {
    title: 'CricVeda — Fantasy Cricket Intelligence API',
    description: 'AI-powered cricket analytics for fantasy sports across 13+ T20 leagues.',
    siteName: 'CricSynthesis',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
