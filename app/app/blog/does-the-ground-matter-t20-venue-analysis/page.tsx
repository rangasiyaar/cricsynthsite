import Link from "next/link";
import type { Metadata } from "next";
import { SITE, SITE_NAME, seo } from "@/lib/seo";
import { AUTHOR, POSTS, postPath } from "@/lib/blog";
import { Byline } from "@/components/Byline";
import { Calibration, Drift, ErrorRemoved, GroundLevel, InningsShape, Persistence } from "@/components/BlogCharts";

const post = POSTS.find((p) => p.slug === "does-the-ground-matter-t20-venue-analysis")!;
const path = postPath(post.slug);
const url = `${SITE}${path}`;
const base = seo(path, "Does the ground matter? T20 venue analysis from 1.7m balls | CricSynthesis", post.description);

export const metadata: Metadata = {
  ...base,
  authors: [{ name: AUTHOR.name }],
  keywords: ["T20 venue analysis", "cricket pitch report", "par score", "ground stats", "pace v spin pitch",
    "women's cricket boundaries", "cricket analytics", "Edgbaston T20", "Wankhede T20", "Dubai T20", "cricket statistics"],
  openGraph: { ...base.openGraph, type: "article", publishedTime: post.date, authors: [AUTHOR.name], tags: post.tags },
};

const FAQ: [string, string][] = [
  ["Does the venue affect the score in T20 cricket?",
    "Yes. It is one of the clearest effects in the data, but a ground's scoring level also drifts from season to season, so recent matches matter more than a ground's long history."],
  ["Do wickets fall at the same stage at a particular ground?",
    "Not in a way that repeats. When wickets fell at a ground before 2025 told us nothing about when they fell after it. Wicket timing depends on the players and the match, not the venue."],
  ["Is a ground the same for men's and women's matches?",
    "No. It was the biggest venue effect we found. Scoring at the same ground differs between men's and women's matches, and the difference repeats from one season to the next."],
  ["How can you judge a new ground with little history?",
    "Start from the other grounds in the same city and let the new ground's own matches pull it away from that. For 66 grounds with limited history this removed about 15% of the error in predicted runs."],
];

const TOC: [string, string][] = [
  ["why", "Why grounds should matter"], ["trap", "The trouble with venue stats"], ["method", "How we tested it"],
  ["level", "1. Grounds differ, and they drift"], ["gender", "2. Men's and women's matches"], ["city", "3. Ask the neighbours"],
  ["shape", "4. The shape of an innings"], ["myth", "The myth: wicket timing"], ["evidence", "What repeats, in one chart"],
  ["result", "Did the forecasts improve?"], ["wrong", "What we still get wrong"], ["fans", "Reading a pitch report"],
  ["limits", "Limitations"], ["faq", "Questions people ask"],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting", headline: post.title, description: post.description, datePublished: post.date, dateModified: post.date,
      mainEntityOfPage: url, image: `${SITE}/og.png?v=3`, keywords: post.tags.join(", "), wordCount: 3300,
      author: { "@type": "Person", name: AUTHOR.name, jobTitle: "Founder", description: AUTHOR.bio, worksFor: { "@type": "Organization", name: SITE_NAME, url: SITE } },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/email-logo.png` } },
    },
    { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE}/blog/` },
      { "@type": "ListItem", position: 2, name: post.title, item: url },
    ] },
  ],
};

export default function Post() {
  return (
    <article className="page-head blog post wide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 820 }}>
        <p className="cs-eyebrow"><Link href="/blog/">Blog</Link> · Venue analysis · Data</p>
        <h1 className="post-title">{post.title}</h1>
        <p className="post-standfirst">
          Pitch reports are full of confident claims about grounds. We checked them against every T20 ball in our records since
          2022: which venue traits repeat from season to season, which are noise, and what it did to our forecasts once we
          built the real ones in.
        </p>
        <Byline name={AUTHOR.name} role={AUTHOR.role} photo={AUTHOR.photo} date={post.date} minutes={post.minutes} url={url} title={post.title} />
        <div className="post-stats">
          <div><b>1.73m</b><span>T20 deliveries scored, 2022 to October 2026</span></div>
          <div><b>163</b><span>grounds with enough cricket since 2025 to test</span></div>
          <div><b>0.04</b><span>how well a ground&rsquo;s wicket timing repeats from one period to the next (0 = not at all)</span></div>
        </div>
      </div>

      <div className="post-layout">
        <div className="post-body">
          <div className="keypoints">
            <h2>Key points</h2>
            <ul>
              <li>Grounds really do change how many runs get scored, and a ground&rsquo;s level drifts from season to season.</li>
              <li>The biggest venue effect: men&rsquo;s and women&rsquo;s matches at the same ground play very differently.</li>
              <li>A ground with little history is best judged from the other grounds in its city.</li>
              <li>Some grounds have a shape: fast starts, slow middles, a lean towards pace or spin. This holds for runs only.</li>
              <li>&ldquo;Wickets fall early here&rdquo; does not repeat at all. When wickets fall is about players, not grounds.</li>
            </ul>
          </div>

          <p className="post-lede">
            Every T20 broadcast starts the same way. Someone walks out to the middle, presses a key into the pitch and tells us
            what a good score is. &ldquo;160 is par here.&rdquo; &ldquo;The spinners will enjoy this one.&rdquo; &ldquo;Wickets
            tend to fall in a heap after the powerplay.&rdquo; We have all nodded along. I wanted to know how much of it is true.
          </p>
          <p>
            At CricSynthesis we forecast matches by playing them out ball by ball on a computer, thousands of times, using the real
            XIs, the ground and every player&rsquo;s record. The ground has always been part of that. But until this week our model
            treated each venue as a single number: this ground adds a few runs, that one takes a few away. The same number applied in
            the first over and the twentieth, against pace and against spin, in a men&rsquo;s match and in a women&rsquo;s match.
            That felt too simple, so we put the ground on trial.
          </p>

          <h2 id="why">Why grounds should matter</h2>
          <p>
            There are good physical reasons to expect venues to differ. Boundary size is the obvious one: a few metres on the rope
            turns a mistimed hit into six or into a catch. The surface matters too: how much grass is left on, how hard the soil
            is, how quickly it dries out under the sun and how much it wears over a long season. Then there is climate. Humid
            evenings bring dew, which makes the ball skid and hard to grip. Dry heat makes a pitch crack and turn. Altitude makes
            the ball travel further.
          </p>
          <p>
            None of that is controversial. The hard part is measuring it. You never see a ground on its own; you see it through
            the 22 players who happened to turn up, on the day they turned up.
          </p>

          <h2 id="trap">The trouble with venue stats</h2>
          <p>
            Most venue numbers you see quoted are plain averages: average first-innings score, average powerplay, wickets to pace
            and spin. They have two problems.
          </p>
          <p>
            <b>They mix up the ground with the teams.</b> A ground that hosts a top franchise league will show big scores
            because the best hitters in the world play there. A ground that hosts associate qualifiers will show lower scores for
            the same reason in reverse. Neither number says much about the ground itself.
          </p>
          <p>
            <b>They are built on small samples.</b> Even a busy ground hosts maybe a few dozen T20s a year, and single matches swing
            wildly. In our data, after accounting for who was playing, the boundary rate in an individual match still varied by
            roughly 28% either way. Three high-scoring games in a row can happen anywhere, and that is often how a ground gets its
            reputation.
          </p>
          <blockquote className="pullquote">A venue trait only counts if it repeats. If a ground really favours spin, it should have favoured spin before 2025 and still favour it after.</blockquote>

          <h2 id="method">How we tested it</h2>
          <p>
            We dealt with both problems the same way. First, instead of comparing grounds to each other, we compared each ground to
            what our model expected <i>for the players who actually played there</i>. Second, we only believed a pattern if it
            showed up in two separate periods.
          </p>
          <div className="method-box">
            <h3>The method in four steps</h3>
            <ol>
              <li><b>Freeze the clock.</b> We built our model using only matches played before 1 January 2025.</li>
              <li><b>Score every ball.</b> For each of the 735,933 T20 deliveries bowled since then, the model gave its expectation
                for that exact ball: who was batting, who was bowling, the over, the wickets down, the target. We then compared that
                with what actually happened: the runs, the boundaries, the wickets.</li>
              <li><b>Group by ground.</b> We added up the gap between expected and actual at each of the 163 grounds with at least
                1,200 balls (about ten T20 innings) since 2025, and split it by stage of the innings, pace or spin, batting first or
                chasing, and men&rsquo;s or women&rsquo;s matches.</li>
              <li><b>Check it repeats.</b> We measured the same splits on 992,372 balls from 2022 to 2024 and asked whether a
                ground&rsquo;s pattern before 2025 predicts its pattern after. If it does not, it is noise, however good the story sounds.</li>
            </ol>
          </div>
          <p>
            Think of it the way you would think about a batter. One great season proves very little; a batter who averages 40 in
            two separate seasons probably is a 40-average batter. We held grounds to the same standard.
          </p>
          <p>
            We report two numbers for each pattern. The first is a <b>correlation</b>: how closely a ground&rsquo;s pattern after 2025
            follows its pattern before, where 0 means not at all and 1 means exactly. The second is the <b>share of error
            removed</b>: if we had used the pre-2025 pattern to adjust our forecasts, how much of our ground-by-ground error since
            2025 would have disappeared? That second number is the one that matters, because it is what a forecast gains.
          </p>

          <h2 id="level">Finding 1: grounds differ, and they drift</h2>
          <p>
            Start with the simplest claim: some grounds produce more runs than others. True, and by a lot. The surprise was how much
            a ground&rsquo;s level moves over time. Since 2025, a handful of well-known grounds have played well above what their
            own history suggested.
          </p>
          <GroundLevel />
          <p>
            Edgbaston is the clearest case: 14% more runs than our model expected for those players, and more than a fifth more in
            the powerplay. The Oval is close behind at 13%. At the other end, the Botswana Cricket Association Oval has given up 12%
            fewer runs than expected and Gahanga International in Kigali 8% fewer.
          </p>
          <p>
            Remember what &ldquo;expected&rdquo; means here. It already includes the ground&rsquo;s pre-2025 record. So these are
            not simply &ldquo;batting grounds&rdquo; and &ldquo;bowling grounds&rdquo;; mostly they are grounds that have changed, or whose
            history was too short to pin down. A new square, a
            different groundsman, ropes moved, a run of dry summers. That is something pitch reports get right: last season&rsquo;s
            par score can be stale this season. Our model already gives recent matches more weight than old ones, and this result
            says it may need to lean on them harder still.
          </p>

          <h2 id="gender">Finding 2: a ground is not the same ground for men and women</h2>
          <p>
            This was the biggest effect we found, and the one I least expected. At the 42 grounds that host plenty of both men&rsquo;s
            and women&rsquo;s T20 cricket, the gap between the two kept repeating. If women&rsquo;s matches at a ground produced more
            boundaries than expected before 2025, they kept doing so after it. The correlation for boundaries was 0.73, by some
            distance the strongest of any split we tested. Using the pre-2025 gap removed 22% of the boundary error and 18% of the
            runs error at those grounds.
          </p>
          <p>
            The likely reasons are practical ones. Boundary ropes are often brought in for women&rsquo;s matches, and how far in
            varies from ground to ground. A big outfield that suppresses sixes in a men&rsquo;s match can play quite differently
            with a shorter rope. The lesson for anyone reading a pitch report before a women&rsquo;s match: be careful with numbers
            borrowed from the men&rsquo;s game at the same venue.
          </p>

          <h2 id="city">Finding 3: when a ground is new, ask the neighbours</h2>
          <p>
            A lot of T20 cricket now happens at grounds with little history: new venues, second grounds, tournaments that move
            around. Until now our model treated a ground with little data as roughly average. We tried a different starting point:
            assume it plays like the other grounds in the same city, then let its own matches pull it away from that.
          </p>
          <p>
            For 66 grounds with limited history, that one change removed about 15% of the error in predicted runs, and the
            correlation between the neighbours&rsquo; level and the new ground&rsquo;s level was 0.49. It makes sense: grounds in the
            same city share a climate and tend to host the same teams and competitions. This mattered to us this week, with the
            women&rsquo;s T20 Spring Challenge being played at Bankstown Oval in Sydney. The ground now starts from what Sydney cricket
            looks like, not from a world average.
          </p>

          <h2 id="shape">Finding 4: some grounds have a shape, but only for runs</h2>
          <p>
            Two more patterns carried over from before 2025 to after it, each removing about 9% of the error in predicted runs. The
            first is the shape of an innings. Some grounds score fast early and squeeze the middle; others are slow to start and
            open up at the death.
          </p>
          <InningsShape />
          <p>
            Read across a row. Dubai is the textbook shape: the powerplay has run 4% above expectation, overs 7 to 16 about 5%
            below, and the death back above. That fits a new ball that comes onto the bat, followed by a surface that slows and
            grips. Bayuemas Oval in Kuala Lumpur has the same fast start and slower middle, but stays slow at the death. Edgbaston is simply above expectation all the
            way through, most of all in the first six overs.
          </p>
          <p>
            The second is pace or spin. At some grounds batters score noticeably more freely against one type of bowling than
            the other, and that preference repeats: a correlation of 0.34 for runs. Note what both of these are about: runs.
            Neither the shape of an innings nor the pace-spin lean said anything useful about wickets, and batting first or
            chasing at a ground carried over only weakly, removing about 3% of the error.
          </p>

          <h2 id="myth">The myth: &ldquo;wickets fall early at this ground&rdquo;</h2>
          <p>
            You will hear it in every preview: this is a ground where you lose wickets up front, or one where collapses come at the
            death. We tested wicket timing every way we could: by stage of the innings, by pace and spin, by batting first or
            second, and for men and women. <b>None of it repeated.</b> The correlation between a ground&rsquo;s wicket pattern
            before 2025 and after it ranged from &minus;0.04 to 0.10. Using it made every forecast slightly worse.
          </p>
          <p>
            That does not mean wickets fall at random. It means the reasons sit with the players and the match: who is batting, who
            is bowling, how the innings is going. Once you account for those, the ground adds nothing. So we deliberately built our
            new venue adjustments to move runs and boundaries and to leave wickets alone. If a model starts &ldquo;learning&rdquo;
            that wickets fall early at a ground, it is learning noise.
          </p>

          <h2 id="evidence">What repeats, in one chart</h2>
          <p>Here are all the splits side by side. The first chart shows how strongly each pattern repeats; the second shows what it is worth to a forecast.</p>
          <Persistence />
          <ErrorRemoved />
          <p>
            Two things stand out. The men&rsquo;s and women&rsquo;s split towers over everything else. And the wickets bars sit on
            or below zero in every group. If you take one thing from this piece, take that picture.
          </p>

          <h2 id="result">Did it make our forecasts better?</h2>
          <p>
            A finding is only useful if it improves the forecast. We built four venue adjustments into the model: men&rsquo;s v
            women&rsquo;s at each ground, the same-city starting point, the stage of the innings, and pace v spin. All of them are
            limited to runs. Each is also cautious by design: a ground&rsquo;s own pattern only takes over once it has enough cricket
            behind it. For the stage-of-innings and pace-spin adjustments that is about 2,000 balls, roughly 16 T20 innings; until
            then the ground stays close to its overall level.
          </p>
          <p>Then we re-ran our full backtest: 750 matches played after 1 January 2025, with the model still built only on earlier data.</p>
          <div className="post-table">
            <table>
              <thead><tr><th></th><th>Old venue model</th><th>New venue model</th></tr></thead>
              <tbody>
                <tr><td>Real first-innings score inside our 80% range (target 80%)</td><td>76.8%</td><td>78.3%</td></tr>
                <tr><td>Typical miss on the first-innings total</td><td>28.8 runs</td><td>27.8 runs</td></tr>
                <tr><td>Win predictions (Brier score, lower is better)</td><td>0.2220</td><td>0.2224</td></tr>
                <tr><td>Players to score 30+ (Brier score)</td><td>0.1607</td><td>0.1606</td></tr>
                <tr><td>Bowlers to take 2+ wickets (Brier score)</td><td>0.2047</td><td>0.2048</td></tr>
              </tbody>
            </table>
          </div>
          <Calibration />
          <p>
            A run less on the typical miss, and a forecast range that catches real scores more often. Win predictions did not
            meaningfully move (a change that small is well inside the noise for 750 matches), and neither did the player numbers.
            I think that is the honest answer. The ground changes how many runs get scored, but it changes them for both sides, so
            it rarely decides who wins. These changes are now in every new forecast on the site, starting with today&rsquo;s match
            in Sharjah.
          </p>

          <h2 id="wrong">What we still get wrong</h2>
          <p>
            Look again at the top of Figure 5: too many real scores still land in the top slices of our range. The reason is not
            about grounds at all. Scoring in T20 cricket keeps rising, and it is rising faster than our model expects.
          </p>
          <Drift />
          <p>
            In matches played within six months of the cutoff we were about four runs short on the average first innings. More than
            a year after it, we were ten runs short. That is the clearest problem left in our forecasts, and it is our next piece of
            work. We will write it up the same way: what we tested, what held and what did not.
          </p>

          <h2 id="fans">What this means when you read a pitch report</h2>
          <ol>
            <li><b>Trust recent seasons over a ground&rsquo;s reputation.</b> A ground&rsquo;s scoring level moves. Two seasons ago is
              already old news.</li>
            <li><b>Treat men&rsquo;s and women&rsquo;s numbers as different grounds.</b> It is the biggest venue effect there is.</li>
            <li><b>For a new venue, look at its neighbours.</b> The other grounds in the same city are a better guide than a world average.</li>
            <li><b>Listen for the shape, not just the total.</b> &ldquo;Quick start, then it slows up&rdquo; is a real, repeatable trait
              at some grounds.</li>
            <li><b>Ignore &ldquo;wickets fall early here&rdquo;.</b> Look at who is bowling with the new ball instead.</li>
          </ol>

          <h2 id="limits">Limitations</h2>
          <p>
            A few honest caveats. Our records cover a lot of associate cricket, which is why grounds in Kigali, Bangkok and Kuala
            Lumpur appear next to Edgbaston: they simply host the most T20 matches. We have no direct data on pitches, weather or
            boundary sizes, so every explanation in this piece of <i>why</i> a pattern exists is a reasonable guess, not a
            measurement. When we measured how much error each split removes, we picked the best of six caution settings using the
            post-2025 data itself, which flatters small gains; anything under about 3% should be read as zero. And correlation
            across two periods tells you a pattern is stable, not what causes it.
          </p>
          <dl className="glossary">
            <dt>Expected runs</dt><dd>What the model predicted for the actual batters, bowlers and match situations, before seeing the result.</dd>
            <dt>Backtest</dt><dd>Forecasting past matches with a model that was only allowed to see earlier data, then scoring it against what happened.</dd>
            <dt>80% range</dt><dd>The band our forecast says the score should fall in four times out of five. A well-calibrated forecast is right about 80% of the time.</dd>
            <dt>Brier score</dt><dd>A standard score for probability forecasts. 0 is perfect; always saying 50-50 scores 0.25.</dd>
          </dl>
          <p>
            If you want to check us, every forecast we publish is frozen at the start of play and scored against the real scorecard
            on our <Link href="/results/">results page</Link>, misses included.
          </p>

          <h2 id="faq">Questions people ask</h2>
          {FAQ.map(([q, a]) => <div key={q} className="post-faq"><h3>{q}</h3><p>{a}</p></div>)}

          <div className="post-author">
            <p><b>{AUTHOR.name}</b> · {AUTHOR.role}</p>
            <p>{AUTHOR.bio}</p>
            <p><Link href="/#next">See the next match forecast</Link> · <Link href="/lab/">Try the MatchSynth Lab</Link> · <Link href="/blog/">More from the blog</Link></p>
          </div>
        </div>

        <nav className="post-toc" aria-label="In this article">
          <p>In this article</p>
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
      </div>
    </article>
  );
}
