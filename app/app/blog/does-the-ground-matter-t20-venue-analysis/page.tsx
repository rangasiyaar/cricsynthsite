import Link from "next/link";
import type { Metadata } from "next";
import { SITE, SITE_NAME, seo } from "@/lib/seo";
import { AUTHOR, POSTS, postPath, prettyDate } from "@/lib/blog";

const post = POSTS.find((p) => p.slug === "does-the-ground-matter-t20-venue-analysis")!;
const path = postPath(post.slug);
const base = seo(path, "Does the ground matter? T20 venue analysis from 1.7m balls | CricSynthesis", post.description);

export const metadata: Metadata = {
  ...base,
  authors: [{ name: AUTHOR.name }],
  keywords: ["T20 venue analysis", "cricket pitch report", "par score", "ground stats", "pace v spin pitch",
    "women's cricket boundaries", "cricket analytics", "Edgbaston T20", "Wankhede T20", "Dubai T20"],
  openGraph: { ...base.openGraph, type: "article", publishedTime: post.date, authors: [AUTHOR.name], tags: post.tags },
};

const FAQ: [string, string][] = [
  ["Does the venue affect the score in T20 cricket?",
    "Yes. The ground is one of the clearest effects in the data, but a ground's scoring level also drifts from season to season, so old averages need to be weighted towards recent matches."],
  ["Do wickets fall at the same stage at a particular ground?",
    "Not in a way that repeats. When wickets fell at a ground before 2025 told us nothing about when they fell after it. Wicket timing depends on the players and the match, not the venue."],
  ["Is a ground the same for men's and women's matches?",
    "No. It was the biggest venue effect we found. Boundary rates at the same ground differ between men's and women's matches, and the difference repeats from one season to the next."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting", headline: post.title, description: post.description, datePublished: post.date,
      dateModified: post.date, mainEntityOfPage: `${SITE}${path}`, image: `${SITE}/og.png?v=3`, keywords: post.tags.join(", "),
      author: { "@type": "Person", name: AUTHOR.name, jobTitle: "Founder", worksFor: { "@type": "Organization", name: SITE_NAME } },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/email-logo.png` } },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default function Post() {
  return (
    <article className="page-head blog post">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="cs-eyebrow"><Link href="/blog/">Blog</Link> · Venue analysis</p>
      <h1 className="post-title">{post.title}</h1>
      <p className="blog-meta">By <b>{AUTHOR.name}</b>, {AUTHOR.role} · {prettyDate(post.date)} · {post.minutes} min read</p>

      <div className="post-body">
        <p className="post-lede">
          Every T20 broadcast starts the same way. Someone walks out to the middle, presses a key into the pitch and tells us
          what a good score is. &ldquo;160 is par here.&rdquo; &ldquo;The spinners will enjoy this one.&rdquo; &ldquo;Wickets
          tend to fall in a heap after the powerplay.&rdquo; We have all nodded along. I wanted to know how much of it is true.
        </p>
        <p>
          At CricSynthesis we forecast matches by playing them out ball by ball on a computer, thousands of times, using the
          real XIs, the ground and every player&rsquo;s record. The ground has always been part of that. But until this week our
          model treated each venue as a single number: this ground adds a few runs, that one takes a few away. The same number
          applied in the first over and the twentieth, against pace and spin, in a men&rsquo;s game and a women&rsquo;s game.
          That felt too simple, so we put the ground on trial.
        </p>

        <h2>How we tested it</h2>
        <p>
          The trap with venue statistics is that almost anything looks like a pattern if you go looking for one. A ground
          hosts a few run-fests and suddenly it is &ldquo;a batting paradise&rdquo;. So we set one rule before we started:
          <b> a venue trait only counts if it repeats.</b> If a ground really favours spin, it should have favoured spin before
          2025 and it should still favour spin after it.
        </p>
        <p>Here is the method, in plain terms:</p>
        <ol>
          <li><b>Freeze the clock.</b> We built our model using only matches played before 1 January 2025.</li>
          <li><b>Score every ball.</b> For each of 735,933 T20 deliveries bowled since then, the model gave its expectation for
            that exact ball: who was batting, who was bowling, the over, the score. Then we compared it with what actually happened.</li>
          <li><b>Group by ground.</b> We added up the gap between expected and actual runs, boundaries and wickets at each of the
            163 grounds with enough cricket since 2025, and split them by stage of the innings, pace or spin, batting first or
            chasing, and men&rsquo;s or women&rsquo;s matches.</li>
          <li><b>Check it repeats.</b> We measured the same splits on 992,372 balls from 2022 to 2024 and asked one question:
            does what a ground did before 2025 help predict what it did after? If it does not, it is noise, however good the
            story sounds.</li>
        </ol>
        <p>
          One honest warning before the results. Cricket has a lot of match-to-match variation that no ground record can see:
          the pitch prepared that morning, the weather, the size of the rope. Even after accounting for the players, the
          boundary rate in a single match swings by roughly 28% either way. So a ground needs a lot of cricket before its
          numbers mean anything, and that is why we only used grounds with at least 1,200 balls since 2025.
        </p>

        <h2>Finding 1: grounds really are different, and the differences move</h2>
        <p>
          Start with the simplest claim: some grounds produce more runs than others. True, and by a lot. The surprise was how
          much a ground&rsquo;s level shifts over time. Since 2025, a handful of famous grounds have played well above what
          their history suggested:
        </p>
        <div className="post-table">
          <table>
            <thead><tr><th>Ground</th><th>Runs v expectation since 2025</th><th>Overs 1-6</th></tr></thead>
            <tbody>
              <tr><td>Edgbaston, Birmingham</td><td>+14%</td><td>+21%</td></tr>
              <tr><td>Kennington Oval, London</td><td>+13%</td><td></td></tr>
              <tr><td>Wankhede Stadium, Mumbai</td><td>+6%</td><td></td></tr>
              <tr><td>Gaddafi Stadium, Lahore</td><td>+4%</td><td>+8%</td></tr>
              <tr><td>Dubai International Stadium</td><td>-1%</td><td>+4%</td></tr>
              <tr><td>Botswana Cricket Association Oval</td><td>-12%</td><td>-7%</td></tr>
            </tbody>
          </table>
          <p className="post-note">&ldquo;Expectation&rdquo; is what our pre-2025 model predicted for those exact batters and bowlers. +14% means 14% more runs were scored than that.</p>
        </div>
        <p>
          Edgbaston is the clearest case: 14% more runs than our model expected for those players, and more than a fifth
          more in the powerplay. That is what pitch reports get right: grounds change, and last season&rsquo;s par score can
          be stale by this season. Our model already gives recent matches more weight than old ones; this says it may need to
          lean on them harder still.
        </p>

        <h2>Finding 2: a ground is not the same ground for men and women</h2>
        <p>
          This was the biggest effect we found, and the one I least expected. At the 42 grounds that host plenty of both men&rsquo;s
          and women&rsquo;s T20 cricket, the gap between the two kept repeating. If women&rsquo;s matches at a ground produced more
          boundaries than expected before 2025, they kept doing so after it. The pattern held strongly for boundaries and well
          for runs. Using the pre-2025 gap removed about a fifth of our error at those grounds.
        </p>
        <p>
          The likely reasons are practical ones. Boundary ropes are often brought in for women&rsquo;s matches, and how far in
          varies from ground to ground. A big outfield that suppresses sixes in a men&rsquo;s game can play quite differently
          with a shorter rope. The lesson for anyone reading a pitch report before a women&rsquo;s match: be careful with
          numbers borrowed from the men&rsquo;s game at the same venue.
        </p>

        <h2>Finding 3: when a ground is new, ask the neighbours</h2>
        <p>
          A lot of T20 cricket now happens at grounds with little history: new venues, second grounds, tournaments that move
          around. Until now, our model treated a ground with little data as roughly average. We tried a different starting
          point: assume it plays like the other grounds in the same city, then let its own matches pull it away from that.
        </p>
        <p>
          For 66 grounds with limited history, that one change removed about 15% of the error in predicted runs. It makes sense:
          grounds in the same city share a climate and tend to host the same teams and competitions. This mattered to
          us this week, with the women&rsquo;s T20 Spring Challenge being played at Bankstown Oval in Sydney: the ground now
          starts from what Sydney cricket looks like, not from a world average.
        </p>

        <h2>Finding 4: some grounds have a shape, but only for runs</h2>
        <p>
          Two more traits carried over from before 2025 to after it, both worth about a 9% improvement in predicted runs:
        </p>
        <ul>
          <li><b>The shape of the innings.</b> Some grounds score fast early and squeeze the middle overs. Dubai is a good
            example: since 2025, the powerplay there has run 4% above expectation and overs 7 to 16 about 5% below. That fits a
            new ball that comes onto the bat, followed by a surface that slows up.</li>
          <li><b>Pace or spin.</b> At some grounds batters score noticeably more freely against one type of bowling than the
            other, and that preference repeats.</li>
        </ul>
        <p>
          Note the phrase &ldquo;for runs&rdquo;. Whether batting first or chasing is easier at a ground carried over only
          weakly, about 3%. And then there is the claim we tested hardest.
        </p>

        <h2>The myth: &ldquo;wickets fall early at this ground&rdquo;</h2>
        <p>
          You will hear it in every preview: this is a ground where you lose wickets up front, or one where collapses come at
          the death. We tested wicket timing every way we could: by stage of the innings, by pace and spin, by batting first or
          second, and for men and women. <b>None of it repeated.</b> The link between a ground&rsquo;s wicket pattern before
          2025 and after it was essentially zero, and using it made predictions slightly worse.
        </p>
        <p>
          That does not mean wickets fall at random. It means the reasons sit with the players and the match: who is batting,
          who is bowling, how the innings is going. Once you account for those, the ground adds nothing. So we deliberately
          built our new venue adjustments to move runs and boundaries, and to leave wickets alone. If a model starts
          &ldquo;learning&rdquo; that wickets fall early at a ground, it is learning noise.
        </p>

        <h2>Did it make our forecasts better?</h2>
        <p>
          A finding is only useful if it improves the forecast, so we re-ran our full backtest on 750 matches played after
          1 January 2025, with the model still built only on earlier data.
        </p>
        <div className="post-table">
          <table>
            <thead><tr><th></th><th>Old venue model</th><th>New venue model</th></tr></thead>
            <tbody>
              <tr><td>Real first-innings score inside our 80% range (target 80%)</td><td>76.8%</td><td>78.3%</td></tr>
              <tr><td>Typical miss on the first-innings total</td><td>28.8 runs</td><td>27.8 runs</td></tr>
              <tr><td>Win predictions (Brier score, lower is better)</td><td>0.2220</td><td>0.2224</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          A run less on the typical miss and a better-calibrated range. Win predictions did not meaningfully move (a change
          that small is well within the noise for 750 matches), which I think is the honest answer: the ground changes how many runs get scored, but it changes them for both sides, so it rarely decides
          who wins. These changes are now in every new forecast on the site, starting with today&rsquo;s match in Sharjah.
        </p>

        <h2>What we still get wrong</h2>
        <p>
          The biggest error left is not about grounds at all. Scoring in T20 cricket keeps rising, and it is rising faster than
          our model expects. Across those 750 matches we were about six runs short on the average first innings, and closer to
          ten runs short for matches more than a year after the cutoff. That is our next piece of work, and we will write it up
          the same way: what we tested, what held and what did not.
        </p>
        <p>
          If you want to check us in the meantime, every forecast we publish is frozen at the start of play and scored against
          the real scorecard on our <Link href="/results/">results page</Link>, misses included.
        </p>

        <h2>Questions people ask</h2>
        {FAQ.map(([q, a]) => (
          <div key={q} className="post-faq"><h3>{q}</h3><p>{a}</p></div>
        ))}

        <div className="post-author">
          <p><b>{AUTHOR.name}</b> is the founder of CricSynthesis, where every match forecast is built from ball-by-ball simulation
            and checked in public after the game.</p>
          <p><Link href="/#next">See the next match forecast</Link> · <Link href="/lab/">Try the MatchSynth Lab</Link></p>
        </div>
      </div>
    </article>
  );
}
