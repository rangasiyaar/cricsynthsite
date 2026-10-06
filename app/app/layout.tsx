import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Footer, Nav } from "@/components/Shell";

export const metadata: Metadata = {
  title: "CricSynthesis — every match, simulated",
  description: "Win chances, score bands, wicket timing and player probabilities for upcoming cricket matches, from 20,000 ball-by-ball simulations.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Set the theme before first paint (same rule as the site: stored choice, else the OS setting).
const themeInit = `(function(){var t=null;try{t=localStorage.getItem('cs-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',t)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <Nav />
        <main className="wrap">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
