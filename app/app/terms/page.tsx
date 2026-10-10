import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Terms of service | CricSynthesis" };

export default function Terms() {
  return (
    <Legal title="Terms of Service" subtitle="Effective 9 October 2026">
      <h2>1. Acceptance</h2>
      <p>By using the CricSynthesis website, an account or the API you agree to these terms. If you accept them for a company, you
        confirm you have the authority to bind it.</p>
      <h2>2. What we provide</h2>
      <p>CricSynthesis provides probabilities, projections, analytics and graphics produced by simulating cricket matches. We do not
        provide live scores or raw match data.</p>
      <h2>3. Forecasts are estimates</h2>
      <p>Every forecast is a probability from simulation, not a certainty. Results will often differ. Nothing on the site or in the API
        is betting, financial or professional advice, and you must not present our output as a guaranteed outcome.</p>
      <h2>4. Accounts</h2>
      <p>You're responsible for activity under your account and for keeping your sign-in secure. Every signed-in account has Pro, including
        MatchSynth Lab, free during the launch beta; we'll give notice before any paid plan applies to you.</p>
      <h2>5. API use</h2>
      <ul>
        <li><b>Keys.</b> Keep API keys confidential and server-side. You are responsible for requests made with your key.</li>
        <li><b>Limits.</b> Usage is subject to the limits of your plan. Don't try to get around them or overload the service.</li>
        <li><b>Caching.</b> You may cache responses for your own service within the cache times we return.</li>
        <li><b>Graphics.</b> You may publish graphics returned by the API in your own products, with the attribution your plan requires.</li>
      </ul>
      <h2>6. Restrictions</h2>
      <p>You may not reverse engineer or attempt to extract our models; resell or sublicense raw API access; use the service to build a
        directly competing product; scrape the site at volume; or use the service for anything unlawful.</p>
      <h2>7. Intellectual property</h2>
      <p>We own the site, the API, the models and their documentation. Data you send in requests remains yours; you let us process it to
        answer the request. Data credits for third-party sources are listed on the <a href="/credits/">credits page</a>.</p>
      <h2>8. Availability and disclaimers</h2>
      <p>The service is provided "as is" and "as available", without warranties of uptime, accuracy or fitness for a purpose.</p>
      <h2>9. Limitation of liability</h2>
      <p>To the extent the law allows, CricSynthesis is not liable for indirect, incidental, special or consequential losses, including lost
        profits, data or business, arising from use of or inability to use the service.</p>
      <h2>10. Suspension and termination</h2>
      <p>We may suspend or close an account or API key that breaks these terms or puts the service at risk. You can stop using the service
        and ask us to delete your account at any time.</p>
      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
      <h2>12. Contact</h2>
      <p>Legal questions and enterprise agreements: <a href="mailto:legal@cricsynthesis.in">legal@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
