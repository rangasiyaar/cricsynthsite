import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/terms/", "Terms of service | CricSynthesis", "The terms that apply when you use the CricSynthesis website, app, MatchSynth Lab and API.");

export default function Terms() {
  return (
    <Legal title="Terms of Service" subtitle="Effective 3 November 2026">
      <h2>1. Acceptance</h2>
      <p>These terms apply when you use the CricSynthesis website, the CricSynthesis app, an account, the API or the CricSynthesis
        tools for AI assistants (together, "the service"). CricSynthesis is currently operated by an individual based in India;
        "we" and "us" mean that operator. By using the service you agree to these terms. If you accept them for a company, you
        confirm you have the authority to bind it.</p>

      <h2>2. Eligibility</h2>
      <p>You must be 18 or older to create an account, or use one with the consent of a parent or guardian.</p>

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
      <p>You're responsible for activity under your account and for keeping your sign-in secure. Every signed-in account has Pro,
        including MatchSynth Lab, free during the launch beta. We'll give notice and show prices, billing terms and the refund
        policy before any paid plan applies to you; nothing is charged without your agreement.</p>

      <h2>7. API and developer tools</h2>
      <ul>
        <li><b>Keys.</b> Keep API keys confidential and server-side. You are responsible for requests made with your key.</li>
        <li><b>Limits.</b> Usage is subject to the limits of your plan. Don't try to get around them or overload the service.</li>
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
