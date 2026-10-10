import type { Metadata, Viewport } from "next";
import "./legacy-docs.css";
import "./legacy-playground.css";
import "./site.css";
import "./globals.css";
import "./design.css";
import { Footer, Nav } from "@/components/Shell";

export const metadata: Metadata = {
  title: "CricSynthesis | Every match, simulated",
  description: "Win chances, score bands, wicket timing and player probabilities for upcoming cricket matches, from 20,000 ball-by-ball simulations.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F3F5F4" };

// Same rule as the website's js/theme-init.js: stored choice, else the OS setting — before first paint.
const themeInit = `(function(){var t=null;try{t=localStorage.getItem('cs-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <Nav />
        <main className="cs-wrap">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
