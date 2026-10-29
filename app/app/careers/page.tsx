import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/careers/", "Careers | CricSynthesis",
  "Open role: Graphics Designer and Video Editor for our Graphics API and Instagram short-form video. Remote, India.");

const APPLY = "hello@cricsynthesis.in";

export default function Careers() {
  return (
    <Legal title="Careers" subtitle="Help build the simulation engine behind modern cricket analysis.">
      <p>We are a small team building cricket forecasts from ball-by-ball simulation: win chances, projected scores, player outlooks and
        matchups for every match we cover, a Scenario Lab for what-ifs, and an API that businesses use for analytics and ready-made
        graphics. We publish forecasts automatically for internationals and the major leagues, and score every one against the result.</p>

      <h2>Graphics Designer &amp; Video Editor</h2>
      <p><b>Remote, India</b> · Freelance, part-time to start (about 15–20 hours a week) · Path to full-time as we grow</p>
      <p>This is our first design hire. You will own how CricSynthesis looks in two places: the graphics our API returns to customers,
        and our short-form videos on Instagram. Both start from the same thing, a forecast built from 20,000 simulated matches, and
        your job is to make those numbers clear, accurate and worth stopping the scroll for.</p>

      <h3>What you will do</h3>
      <p><b>API graphics (about half your time)</b></p>
      <ul>
        <li>Design the templates our Graphics API renders: match preview cards, win-probability bars, projected-score ranges, player
          cards, matchup grids, fantasy XIs and post-match "what we said v what happened" cards.</li>
        <li>Build them as a system: one type scale, colour set and spacing, in light and dark, at 1:1, 4:5, 9:16 and 16:9.</li>
        <li>Hand over clean, layered SVG that a developer can turn into a template filled with live data. You will work through edge
          cases with us: long player names, ties, rain-reduced matches, women's and men's teams, 50-over and T20 formats.</li>
        <li>Keep a small brand kit: logo use, team colour rules, icons, chart styles and thumbnail templates.</li>
      </ul>
      <p><b>Instagram short-form video (about half your time)</b></p>
      <ul>
        <li>Edit 3–5 Reels a week, 15–45 seconds each: pre-match forecasts ("India win 59% of 20,000 simulations"), toss and XI
          updates, key duels, Scenario Lab what-ifs, and post-match checks of how our forecast held up.</li>
        <li>Turn our charts and screen recordings of the site into motion: animated numbers, bars filling, ranges narrowing.</li>
        <li>Write on-screen text and captions in plain English (Hindi a plus), with a hook in the first two seconds and burned-in
          subtitles for viewers watching on mute.</li>
        <li>Prepare carousels and cover frames, and turn a match-day video around within 2–3 hours of the team news on big match days.</li>
        <li>Read Instagram Insights each week and tell us what to keep, change or drop.</li>
      </ul>

      <h3>What we will not ask for</h3>
      <ul>
        <li>No broadcast or match footage, and no player photos we do not hold a licence for. Our videos are built from our own graphics
          and screen recordings.</li>
        <li>No betting tips or bookmaker promotion. We publish probabilities, and every video says so.</li>
      </ul>

      <h3>Your first 90 days</h3>
      <ul>
        <li><b>Month 1:</b> a brand kit and Reel template set, plus three API card designs (match preview, win probability, player card).</li>
        <li><b>Month 2:</b> the full API card set in all four sizes and both themes, handed over as SVG; a steady 3 Reels a week.</li>
        <li><b>Month 3:</b> a post-match "how we did" format, a match-day turnaround routine, and a short report on what is working on Instagram.</li>
      </ul>

      <h3>Eligibility</h3>
      <ul>
        <li>18 or older and based in India, able to work in Indian Standard Time with a few hours' overlap with us each weekday.</li>
        <li>At least one year of design or editing work, paid or freelance. A degree is not required; your portfolio matters more.</li>
        <li>A portfolio showing data-led graphics (charts, infographics, sports or finance cards) and at least ten short-form videos you
          edited, with a note on your part in each.</li>
        <li>You follow cricket and know the formats, the language of the game and its numbers: strike rate, economy, powerplay, required rate.</li>
        <li>Careful with numbers. A wrong percentage on a card is a bug, not a typo.</li>
        <li>Your own laptop able to run the tools below, and a reliable internet connection.</li>
      </ul>

      <h3>Tools</h3>
      <ul>
        <li><b>Required:</b> Figma (components, auto layout, variables), and Adobe Illustrator or Affinity Designer for SVG work.</li>
        <li><b>Required:</b> Adobe Premiere Pro or DaVinci Resolve for editing, and After Effects (or a comparable motion tool) for animated graphics.</li>
        <li><b>Useful:</b> CapCut or Instagram's editor for quick match-day turnarounds; OBS or another screen recorder; Photoshop for thumbnails;
          Meta Business Suite and Instagram Insights.</li>
        <li><b>A plus:</b> basic SVG, HTML and CSS; Lottie or Rive; an eye for data visualisation and accessible colour contrast.</li>
      </ul>

      <h3>How we work</h3>
      <ul>
        <li>Remote and mostly written: a weekly plan, a short review call, and feedback in shared files.</li>
        <li>You own the visual side and decide how it looks; we own the numbers and check every figure before it goes out.</li>
        <li>Paid per month for agreed hours or per project, discussed with shortlisted candidates. We will raise the hours and move
          to a full-time role as the work grows.</li>
      </ul>

      <h3>How to apply</h3>
      <p>Email <a href={`mailto:${APPLY}?subject=Graphics%20%26%20Video%20Editor`}>{APPLY}</a> with the subject
        "Graphics &amp; Video Editor" and include:</p>
      <ul>
        <li>a portfolio link, with two or three Reels you edited and one data graphic you are proud of;</li>
        <li>the tools you use day to day;</li>
        <li>how many hours a week you can give, and when you could start;</li>
        <li>your expected monthly or per-project rate.</li>
      </ul>
      <p>We reply to every application. Shortlisted candidates get a paid trial task: one match card and one 20–30 second Reel from a
        real forecast we send you, followed by a 30-minute call.</p>
    </Legal>
  );
}
