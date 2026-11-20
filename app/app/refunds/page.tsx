import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/refunds/", "Refund and cancellation policy | CricSynthesis",
  "How cancelling CricSynthesis Pro works, when refunds apply, and how to ask for one.");

export default function Refunds() {
  return (
    <Legal title="Refund and Cancellation Policy" subtitle="Effective 18 November 2026">
      <p>This policy covers CricSynthesis Pro, our subscription for the website and the Android app (₹349 a month or ₹3,769
        a year). It is part of our <a href="/terms/#pro">Terms of Service</a>. Payments are processed by Razorpay.</p>

      <h2>1. Cancelling</h2>
      <ul>
        <li><b>Any time, in one tap.</b> Cancel from your account: on the website under Account → Subscription, or in the app under
          Account → Plan. No email or call needed.</li>
        <li><b>During the free day.</b> If you cancel before your free day ends, you are not charged at all. Pro stays on until the
          free day ends. The ₹5 autopay check taken when you start is refunded automatically by Razorpay, whether or not you
          cancel.</li>
        <li><b>On a paid plan.</b> Cancelling stops the next renewal. You keep Pro until the end of the month or year you have
          already paid for, and you won&apos;t be charged again.</li>
        <li><b>UPI Autopay and card mandates.</b> Cancelling also stops the mandate we use for renewals. You can also revoke a UPI
          Autopay mandate from your UPI app; we&apos;ll treat that as a cancellation.</li>
      </ul>

      <h2>2. Refunds</h2>
      <ul>
        <li><b>Periods already started.</b> Because Pro is a digital service available immediately, a month or year that has
          started isn&apos;t refunded, in full or in part, when you cancel.</li>
        <li><b>Charged in error.</b> If you were charged twice, charged after you cancelled, or charged an amount different from
          the price shown at checkout, we refund the extra amount in full.</li>
        <li><b>Service not delivered.</b> If you paid but Pro didn&apos;t turn on for your account and we can&apos;t fix it within 2 working
          days of you telling us, we refund that payment in full.</li>
        <li><b>Where the law requires it.</b> Nothing in this policy limits a refund you are entitled to under applicable law.</li>
        <li><b>Promo codes.</b> A discount from a promo code (such as WELCOME100) has no cash value and isn&apos;t refunded separately.</li>
      </ul>

      <h2>3. How to ask for a refund</h2>
      <p>Write to <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a> from the email on your account, or use the
        <a href="/contact/"> contact page</a>, within 30 days of the payment. Include the date and amount, or the payment ID from
        Razorpay&apos;s receipt email. We reply within 2 working days.</p>

      <h2>4. When refunds arrive</h2>
      <p>Approved refunds are sent back to the payment method you used, through Razorpay, usually within 5–7 working days. Your
        bank or UPI app may take a few more days to show it.</p>

      <h2>5. API plans</h2>
      <p>API Plus and Business plans are agreed with our team before any payment. Their cancellation and refund terms are the
        ones confirmed in writing with you; where nothing else is agreed, this policy applies.</p>
    </Legal>
  );
}
