import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/delivery/", "Shipping and delivery policy | CricSynthesis",
  "CricSynthesis Pro is a digital service: nothing is shipped, and access starts as soon as you subscribe.");

export default function Delivery() {
  return (
    <Legal title="Shipping and Delivery Policy" subtitle="Effective 18 November 2026">
      <h2>1. Digital service only</h2>
      <p>CricSynthesis sells digital services: CricSynthesis Pro on the website and the Android app, and API access for
        developers. We don&apos;t sell or ship physical goods, so there are no shipping charges and no delivery address is needed.</p>

      <h2>2. When you get access</h2>
      <ul>
        <li><b>CricSynthesis Pro.</b> Access starts straight away once your free day starts or your payment is confirmed, usually
          within a few seconds. Every match-centre tab and MatchSynth Lab open on the account you subscribed with, on the website
          and in the app.</li>
        <li><b>Receipts.</b> Razorpay emails a receipt for every payment to the email you use at checkout.</li>
        <li><b>API plans.</b> API keys are available immediately from your account. Higher API Plus and Business limits apply to
          your keys as soon as the plan is confirmed.</li>
      </ul>

      <h2>3. Where it works</h2>
      <p>The service is delivered over the internet and works anywhere you can reach cricsynthesis.in or use the Android app.
        Prices are in Indian rupees.</p>

      <h2>4. If access doesn&apos;t start</h2>
      <p>If you&apos;ve paid and Pro hasn&apos;t turned on within 30 minutes, sign out and back in. If it still isn&apos;t on, write to
        <a href="mailto:hello@cricsynthesis.in"> hello@cricsynthesis.in</a> with the email on your account and the payment ID from
        your receipt. If we can&apos;t fix it within 2 working days, we refund the payment in full (see the
        <a href="/refunds/"> Refund and Cancellation Policy</a>).</p>
    </Legal>
  );
}
