import type { Metadata, Viewport } from "next";
import "./legacy-docs.css";
import "./legacy-playground.css";
import "./site.css";
import "./globals.css";
import "./design.css";
import { Footer, Nav } from "@/components/Shell";
import { SITE, SITE_NAME, seo } from "@/lib/seo";

const HOME_DESC = "Who wins, the likely scores and the players to watch. Free pre-match forecasts for upcoming cricket matches, checked against every result.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  ...seo("/", "CricSynthesis | Cricket match forecasts and simulation", HOME_DESC),
  applicationName: SITE_NAME,
  keywords: ["cricket predictions", "cricket match forecast", "win probability", "T20 predictions", "cricket simulation",
    "cricket analytics", "cricket API", "projected score", "fantasy cricket", "MatchSynth Lab"],
  icons: { icon: "/favicon.svg" },
};

// Structured data so search engines and AI assistants know what the site is.
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: SITE_NAME, url: SITE, logo: `${SITE}/logo-mark.svg` },
    { "@type": "WebSite", "@id": `${SITE}/#site`, name: SITE_NAME, url: SITE, publisher: { "@id": `${SITE}/#org` },
      description: HOME_DESC, inLanguage: "en-IN" },
    { "@type": "WebApplication", name: "CricSynthesis Match Centre", url: `${SITE}/match/`, applicationCategory: "SportsApplication",
      operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      description: "Pre-match cricket forecasts: win probability, projected scores, top scorer and wicket-taker odds." },
  ],
});
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f2f2f3" };

// Same rule as the website's js/theme-init.js: stored choice, else the OS setting — before first paint.
const themeInit = `(function(){var t=null;try{t=localStorage.getItem('cs-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <Nav />
        <main className="cs-wrap">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
