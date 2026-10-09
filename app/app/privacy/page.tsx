import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy policy | CricSynthesis" };

export default function Privacy() {
  return (
    <Legal title="Privacy Policy" subtitle="Effective 9 October 2026">
      <h2>1. Introduction</h2>
      <p>CricSynthesis runs a cricket match centre for fans and an analytics, simulation and graphics API for businesses.
        This policy explains what we collect when you use the website, an account or the API, and how we use it.</p>
      <h2>2. Information we collect</h2>
      <ul>
        <li><b>Account details.</b> When you sign in with Google or with email and password we receive your name, email address,
          profile picture (Google only) and a user ID. Passwords are handled by our sign-in provider; we never see them.</li>
        <li><b>Contact and access requests.</b> Name, work email, organisation and interest you enter in our forms.</li>
        <li><b>API usage.</b> For API customers: API key, request counts, endpoints called, timestamps and IP addresses, used to
          enforce plan limits and keep the service secure.</li>
        <li><b>Scenario Lab inputs.</b> What-if simulations run inside your browser. The levers you set are not sent to us.</li>
        <li><b>Preferences.</b> Your light/dark theme choice is stored in your browser only.</li>
      </ul>
      <h2>3. How we use it</h2>
      <ul>
        <li>To sign you in and give your account its plan features.</li>
        <li>To answer requests, issue API keys and provide support.</li>
        <li>To enforce rate limits and the terms of service, and to protect the service against abuse.</li>
        <li>To understand aggregate usage so we can improve the product.</li>
      </ul>
      <p>We don't sell, rent or trade personal information, and we don't use it for advertising.</p>
      <h2>4. Service providers</h2>
      <p>The site, sign-in and API run on Google Cloud and Firebase (Google LLC). Contact forms are stored in Google Workspace.
        These providers process data on our behalf under their own security and privacy commitments. We may also disclose
        information where the law requires it.</p>
      <h2>5. Retention and your choices</h2>
      <p>Account data is kept while your account is active. You can ask us to export or delete your account and associated data
        at any time by writing to <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>; we act on requests within
        30 days.</p>
      <h2>6. Security</h2>
      <p>All traffic is encrypted with TLS. API keys are stored only as hashes. No method of transmission or storage is completely
        secure, but we work to protect your information.</p>
      <h2>7. Our forecasts</h2>
      <p>Forecasts are built from historical ball-by-ball records of past matches and contain no personal data about you. API
        customers must not send personal data about their own end users in requests.</p>
      <h2>8. Changes</h2>
      <p>We'll update this page and its effective date when the policy changes, and email account holders about significant changes.</p>
      <h2>9. Contact</h2>
      <p>Questions about privacy: <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
