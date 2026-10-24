import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { DownloadButton, PhonePreview, VersionLine } from "@/components/AppDownload";

export const metadata: Metadata = seo("/app/", "Android app | CricSynthesis",
  "Get CricSynthesis on Android: win chances, projected scores, player outlooks and fantasy picks for every match, match alerts, and MatchSynth Lab on your phone. Free.");

const FEATURES: { title: string; text: string }[] = [
  { title: "Every match, one tap away", text: "Win chances, projected scores, wickets, players, match-ups and fantasy picks, laid out as a menu you can move through with your thumb." },
  { title: "MatchSynth Lab in your hand", text: "Change the toss, the pitch, the dew or a player's form, or start from any score, and the match is simulated again on your phone." },
  { title: "Alerts when it matters", text: "A notification when a new forecast is up and when the playing XIs change it. Choose which ones you want, or none." },
  { title: "Works without signal", text: "The last forecasts you opened are kept on the phone, so the match centre still opens in a stadium with no network." },
  { title: "Built for phones", text: "Native back gestures, pull to refresh, light and dark themes, and screens that slide like the rest of Android." },
  { title: "Small and private", text: "About 7 MB, no ads, and it only asks for the internet and, if you turn alerts on, notifications." },
];

const FAQ: [string, React.ReactNode][] = [
  ["Why isn't it on the Play Store?", "It will be. Until then you install it straight from this page, which Android allows once you say yes to installs from your browser."],
  ["Is it safe to install?", "Every version is signed with the same CricSynthesis key, so Android will only ever update it with a build from us. It needs no special permissions."],
  ["How do I update it?", "Download it again from this page and install. It updates in place and keeps your sign-in and settings."],
  ["Is it free?", <>Yes. The match centre is free, and MatchSynth Lab is part of Pro, which every signed-in account gets free during the beta. See <Link href="/pricing/">plans</Link>.</>],
  ["I have an iPhone.", "There's no iPhone app yet. The website works the same way: in Safari tap Share, then Add to Home Screen, and it opens like an app."],
];

export default function AppPage() {
  return (
    <>
      <section className="cs-hero app-hero">
        <div>
          <p className="cs-eyebrow">Android app</p>
          <h1><span>Every match.</span><span>In your pocket.</span></h1>
          <p className="cs-lede">Forecasts for every match we cover, alerts when the teams are named, and MatchSynth Lab to re-run any
            match your way. Free on Android.</p>
          <div className="cs-hero-ctas">
            <DownloadButton />
            <a className="btn ghost" href="#install">How to install</a>
          </div>
          <VersionLine />
        </div>
        <PhonePreview />
      </section>

      <h2>What&apos;s in it</h2>
      <div className="grid g3" style={{ marginTop: 20 }}>
        {FEATURES.map((f) => (
          <div key={f.title} className="card"><h3>{f.title}</h3><p className="small muted" style={{ margin: "6px 0 0" }}>{f.text}</p></div>
        ))}
      </div>

      <h2 id="install" style={{ marginTop: 72, scrollMarginTop: 96 }}>Install in a minute</h2>
      <ol className="cs-steps" style={{ marginTop: 20 }}>
        <li><div className="cs-step-n">01</div><h3>Download</h3><p>Open this page on your Android phone and tap Download. The file is about 7 MB.</p></li>
        <li><div className="cs-step-n">02</div><h3>Allow and install</h3><p>Open the download. If Android asks, allow installs from your browser, then tap Install.</p></li>
        <li><div className="cs-step-n">03</div><h3>Open and sign in</h3><p>Browse matches straight away, or sign in with Google or email to open MatchSynth Lab.</p></li>
      </ol>

      <h2 style={{ marginTop: 72 }}>Questions</h2>
      <div className="app-faq">
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>

      <div className="app-cta">
        <h2>Take the match centre with you.</h2>
        <DownloadButton />
      </div>
    </>
  );
}
