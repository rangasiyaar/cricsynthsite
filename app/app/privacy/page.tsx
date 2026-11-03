import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/privacy/", "Privacy policy | CricSynthesis", "How CricSynthesis collects, uses and protects your information.");

export default function Privacy() {
  return (
    <Legal title="Privacy Policy" subtitle="Effective 3 November 2026">
      <h2>1. Who we are</h2>
      <p>CricSynthesis runs a cricket match centre and Android app for fans, and an analytics, simulation and graphics API for
        businesses. CricSynthesis is currently operated by an individual based in India, who is the data fiduciary for the
        personal data described here. This policy explains what we collect when you use the website, the app, an account or
        the API, how we use it and the choices you have. It is written to meet India's Digital Personal Data Protection Act, 2023.</p>

      <h2>2. Information we collect</h2>
      <ul>
        <li><b>Account details.</b> When you sign in with Google or with email and password we receive your name, email address,
          profile picture (Google only) and a user ID. Passwords are handled by our sign-in provider; we never see them.</li>
        <li><b>Profile and preferences.</b> Details you add to your profile and your email preferences.</li>
        <li><b>Account activity.</b> Daily counts of how much you use your account's features, and plan or upgrade requests you
          file from your dashboard.</li>
        <li><b>Contact and access requests.</b> Name, work email, organisation and interest you enter in our forms.</li>
        <li><b>Job applications.</b> The details and resume you submit when you apply for a role, including optional details such
          as gender. We use them only to assess your application and contact you about it, and delete them within 12 months
          unless you ask us to keep them longer.</li>
        <li><b>API usage.</b> For API customers: API key, request counts, endpoints called, timestamps and IP addresses, used to
          enforce plan limits and keep the service secure.</li>
        <li><b>Android app.</b> If the app crashes, it sends a crash report (device model, operating system and app version, and
          technical details of the error). Crash reports are not linked to your account. If you turn on match alerts, your device
          is registered to receive them; we see only which alerts are subscribed to, not who you are.</li>
        <li><b>MatchSynth Lab inputs.</b> What-if simulations run on your device. The settings you choose are not sent to us.</li>
        <li><b>Stored on your device.</b> Your theme choice, alert choices, saved Lab settings and a cache of match data that
          lets the site and app load faster and work offline. These stay in your browser or app and you can clear them at any time.</li>
      </ul>
      <p>We don't use advertising cookies or third-party tracking on the website.</p>

      <h2>3. How we use it</h2>
      <ul>
        <li>To sign you in and give your account its plan features.</li>
        <li>To answer requests, issue API keys and provide support.</li>
        <li>To send account emails such as a welcome message and important service notices, and, if your email preferences allow,
          product updates. You can change email preferences in your account at any time.</li>
        <li>To enforce rate limits and these terms, and to protect the service against abuse.</li>
        <li>To fix crashes and understand aggregate usage so we can improve the product.</li>
      </ul>
      <p>We process your data on the basis of the consent you give when you create an account, submit a form or turn on a
        feature, and where it is needed to provide the service you asked for or to meet a legal obligation. We don't sell,
        rent or trade personal information, and we don't use it for advertising.</p>

      <h2>4. Service providers and transfers</h2>
      <p>The website, app, sign-in, storage and API run on Google Cloud and Firebase (Google LLC), and contact forms and email
        are handled by our email and workspace providers. These providers process data on our behalf under their own security
        and privacy commitments. Data is stored on servers in the United States. We may also disclose information where the
        law requires it.</p>

      <h2>5. Retention</h2>
      <p>Account data is kept while your account is active and deleted within 30 days of a deletion request, except where the
        law requires us to keep a record. API usage logs and crash reports are kept only as long as needed for security,
        billing and fixing problems. Job applications are kept as described above.</p>

      <h2>6. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>tell you what personal data we hold about you and how we use it;</li>
        <li>correct, complete or update it;</li>
        <li>delete it, and close your account;</li>
        <li>withdraw consent you have given (this won't affect processing already done, but some features may stop working);</li>
        <li>nominate another person to exercise these rights for you if you die or become unable to do so.</li>
      </ul>
      <p>Write to <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>. We may need to confirm your identity
        before acting, and we respond within 30 days.</p>

      <h2>7. Children</h2>
      <p>CricSynthesis is meant for people aged 18 and over. Under-18s may use an account only with the verifiable consent of a
        parent or guardian. If you believe a child has given us personal data without that consent, contact us and we'll delete it.</p>

      <h2>8. Security</h2>
      <p>All traffic is encrypted with TLS. API keys are stored only as hashes, and access to systems that hold personal data is
        restricted to the people who need it. No method of transmission or storage is completely secure. If a
        breach affects your personal data, we'll notify you and the authorities as the law requires.</p>

      <h2>9. Our forecasts</h2>
      <p>Forecasts are built from records of past matches and contain no personal data about you. API customers must not send
        personal data about their own end users in requests.</p>

      <h2>10. Grievances</h2>
      <p>For any concern about how we handle your data, contact our grievance officer at
        {" "}<a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>. We acknowledge complaints within 7 days and
        resolve them within 30 days. If you're not satisfied with our response, you may complain to the Data Protection Board
        of India.</p>

      <h2>11. Changes</h2>
      <p>We'll update this page and its effective date when the policy changes, and email account holders about significant changes.</p>

      <h2>12. Contact</h2>
      <p>Questions about privacy: <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
