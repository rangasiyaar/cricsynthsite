import React from "react";
import './globals.css';

export const metadata = {
  title: "CricVeda — Fantasy Cricket Intelligence API | CricSynthesis",
  description: "The world's most comprehensive, data-driven intelligence layer for T20 cricket. Powering smarter fantasy decisions through deep ball-by-ball analytics across every T20 league globally.",
  keywords: "cricket, fantasy, API, T20, analytics, IPL, BBL, PSL, form score, matchup, CricSynthesis",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="noise-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
