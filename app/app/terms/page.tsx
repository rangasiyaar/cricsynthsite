import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/terms/", "Terms of service | CricSynthesis", "The terms that apply when you use the CricSynthesis website, app, MatchSynth Lab and API.");

export default function Terms() {
  return (
    <Legal title="Terms of Service" subtitle="Effective 17 November 2026">
      <h2>1. Acceptance</h2>
      <p>These terms apply when you use the CricSynthesis website, the CricSynthesis app, an account, the API or the CricSynthesis
        tools for AI assistants (together, "the service"). CricSynthesis is currently operated by an individual based in India;
        "we" and "us" mean that operator. By using the service you agree to these terms. If you accept them for a company, you
        confirm you have the authority to bind it.</p>

      <h2>2. Eligibility</h2>
      <p>You must be 18 or older to create or use a CricSynthesis account, including API keys, the AI-assistant connector and
        the Android app&apos;s signed-in features. When you first sign in we ask for your date of birth to confirm this; if you
        are under 18 we won&apos;t open an account and we delete the sign-in straight away. By signing in you confirm that the
        date of birth you give is true. We may close an account, and revoke its API keys, if we learn its holder is under 18.
        Public match pages can be read without an account.</p>

      <h2>3. What we provide</h2>
      <p>CricSynthesis provides probabilities, projections, analytics, match previews, fantasy team suggestions and graphics
        produced by simulating cricket matches. We do not provide live scores or raw match data.</p>

      <h2>4. Forecasts are estimates</h2>
      <p>Every forecast, preview and fantasy suggestion is an estimate, not a certainty, and results will often differ. Nothing
        in the service is betting, gaming, financial or professional advice, and you must not present our output as a guaranteed
        outcome. We don't offer, promote or facilitate betting or online money games, and you must not use the service for them.</p>

      <h2>5. No affiliation</h2>
      <p>CricSynthesis is independent. We are not affiliated with, endorsed by or sponsored by any cricket board, league, team,
        player or broadcaster. Their names are used only to identify the matches and players we analyse, and their trademarks
        belong to their owners.</p>

      <h2>6. Accounts</h2>
      <p>You're responsible for activity under your account and for keeping your sign-in secure. We keep a record of your account
        and how it is used (see the <a href="/privacy/">privacy policy</a>), which our team may review to support you, manage
        plans and keep the service working.</p>

      <h3 id="pro">CricSynthesis Pro</h3>
      <ul>
        <li><b>What it is.</b> A subscription that opens every match-centre tab for every match we cover, and MatchSynth Lab, on the
          website and in the app. Each match&apos;s Overview stays free.</li>
        <li><b>Price.</b> ₹349 a month or ₹3,769 a year, in Indian rupees. The price shown at checkout is the price you pay.</li>
        <li><b>Free day.</b> New accounts can try Pro free for one day, once per account. You add a payment method to start; to set
          up autopay, Razorpay takes ₹5 to check it and refunds it straight away. The first charge is taken when the free day ends
          unless you cancel before then.</li>
        <li><b>Renewal.</b> Your plan renews automatically each month or year until you cancel. Payments are handled by Razorpay;
          we never see your card or UPI details.</li>
        <li><b>Cancelling.</b> Cancel any time from your account. You keep Pro until the end of the period you&apos;ve paid for and
          you won&apos;t be charged again. If a renewal payment fails, Pro stays on for 3 days while the payment is retried.</li>
        <li><b>Refunds.</b> A period that has started isn&apos;t refunded, except where the law requires it, you were charged in
          error, or Pro didn&apos;t turn on for you. Details and how to ask are in our
          <a href="/refunds/"> Refund and Cancellation Policy</a>; delivery is covered in our <a href="/delivery/">Shipping and Delivery Policy</a>.</li>
        <li><b>Promo codes.</b> A promo code such as WELCOME100 gives the discount it states on your first payment only, for accounts
          that haven&apos;t paid for Pro before. One code per account. A code is instead of the free day: with it, your plan starts and is charged straight away. It has
          no cash value and we may end an offer at any time.
          Later renewals are at the full price.</li>
        <li><b>Changes.</b> If we change the price, we&apos;ll tell you before it applies to your next renewal.</li>
      </ul>

      <h2>7. API and developer tools</h2>
      <ul>
        <li><b>Keys.</b> Keep API keys confidential and server-side. You are responsible for requests made with your key.</li>
        <li><b>Limits.</b> Usage is subject to the limits of your plan. Don't try to get around them or overload the service.</li>
        <li><b>Monitoring.</b> We count requests and tool calls per key, per account and per endpoint to apply plan limits, show
          your usage in your dashboard and detect misuse. We may contact you about your usage, for example when you regularly
          reach your plan's limit.</li>
        <li><b>Caching.</b> You may cache responses for your own service within the cache times we return.</li>
        <li><b>Graphics.</b> You may publish graphics returned by the API in your own products, with the attribution your plan requires.</li>
        <li><b>Tools for AI assistants.</b> The downloadable package is licensed to you for use with your own account and plan.
          Don't redistribute it or extract the data or models it uses.</li>
      </ul>

      <h2>8. Restrictions</h2>
      <p>You may not reverse engineer, copy or attempt to extract our models, methods or data; resell or sublicense raw API access;
        use the service or its output to train or build a competing model or product; scrape the site or app at volume; or use the
        service for anything unlawful.</p>

      <h2>9. Intellectual property</h2>
      <p>We own the site, the app, the API, the models, our content (including previews, articles and social media posts) and
        their documentation. You may share links to our pages and posts, and quote short extracts with credit to CricSynthesis.
        Data you send in requests remains yours; you let us process it to answer the request. Data credits for third-party
        sources are listed on the <a href="/credits/">credits page</a>.</p>

      <h2>10. Availability and disclaimers</h2>
      <p>The service is provided "as is" and "as available", without warranties of uptime, accuracy or fitness for a purpose. We
        may change, add or remove features at any time.</p>

      <h2>11. Limitation of liability</h2>
      <p>To the extent the law allows, we are not liable for indirect, incidental, special or consequential losses, including lost
        profits, data or business, arising from use of or inability to use the service. Our total liability for any claim is
        limited to the amount you paid us for the service in the 12 months before the claim.</p>

      <h2>12. Suspension and termination</h2>
      <p>We may suspend or close an account or API key that breaks these terms or puts the service at risk. You can stop using the
        service and ask us to delete your account at any time.</p>

      <h2>13. Changes to these terms</h2>
      <p>We may update these terms. We'll change the effective date above and email account holders about significant changes
        before they apply. Continuing to use the service after that means you accept the updated terms.</p>

      <h2>14. Governing law</h2>
      <p>These terms are governed by the laws of India, and disputes are subject to the jurisdiction of the courts of India.</p>

      <h2>15. Contact</h2>
      <p>Legal questions and enterprise agreements: <a href="mailto:legal@cricsynthesis.in">legal@cricsynthesis.in</a>. Privacy
        questions: <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
