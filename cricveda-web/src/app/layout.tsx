import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CricVeda", template: "%s | CricVeda" },
  description: "Cricket intelligence — predictions, player form, and dream team selection.",
};

export const viewport: Viewport = { themeColor: "#06080d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#06080d]/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-gradient flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M3 3v18h18" strokeLinecap="round" />
                  <path d="M7 16l4-4 4 4 6-6" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-display font-700 text-base text-white tracking-tight">CricSynthesis</span>
            </a>
            <nav className="flex items-center gap-1">
              <a href="/" className="px-3 py-1.5 rounded-lg text-sm text-[#9ca3b0] hover:text-white hover:bg-white/[0.04] transition-colors">
                Matches
              </a>
              <a href="/dashboard" className="px-3 py-1.5 rounded-lg text-sm text-[#9ca3b0] hover:text-white hover:bg-white/[0.04] transition-colors">
                Dashboard
              </a>
              <a href="/docs" className="px-3 py-1.5 rounded-lg text-sm text-[#9ca3b0] hover:text-white hover:bg-white/[0.04] transition-colors">
                Docs
              </a>
              <a href="https://cricsynthesis.in/login.html" className="ml-2 btn-primary !py-1.5 !text-xs">
                Get API Key
              </a>
            </nav>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        <footer className="border-t border-white/[0.06] py-8 mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#4b5263]">© 2026 CricSynthesis. Predictions are for informational purposes only.</p>
            <div className="flex items-center gap-4">
              <a href="https://cricsynthesis.in/docs.html" className="text-xs text-[#6b7280] hover:text-[#9ca3b0] transition-colors">API Docs</a>
              <a href="https://cricsynthesis.in/privacy.html" className="text-xs text-[#6b7280] hover:text-[#9ca3b0] transition-colors">Privacy</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
