import type { Metadata, Viewport } from "next";
import "./site.css";
import "./globals.css";
import { Footer, Nav } from "@/components/Shell";

export const metadata: Metadata = {
  title: "CricSynthesis | Every match, simulated",
  description: "Win chances, score bands, wicket timing and player probabilities for upcoming cricket matches, from 20,000 ball-by-ball simulations.",
  icons: { icon: "/favicon.svg" },
};
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
      </head>
      <body>
        <Nav />
        <main className="cs-wrap">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
