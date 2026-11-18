import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/privacy/", "Privacy policy | CricSynthesis", "How CricSynthesis collects, uses and protects your information.");

export default function Privacy() {
  return (
    <Legal title="Privacy Policy" subtitle="Effective 17 November 2026">
      <h2>1. Who we are</h2>
      <p>CricSynthesis runs a cricket match centre and Android app for fans, and an analytics, simulation and graphics API for
        businesses. CricSynthesis is currently operated by an individual based in India, who is the data fiduciary for the
        personal data described here. This policy explains what we collect when you use the website, the app, an account or
        the API, how we use it and the choices you have. It is written to meet India's Digital Personal Data Protection Act, 2023.</p>

      <h2>2. Information we collect</h2>
      <ul>
        <li><b>Account details.</b> When you sign in with Google or with email and password we receive your name, email address,
          profile picture (Google only) and a user ID. Passwords are handled by our sign-in provider; we never see them.</li>
        <li id="age"><b>Age confirmation.</b> Accounts are for people aged 18 and over. When you first sign in we ask for your
          date of birth and check it on your device: we keep only a record that you confirmed you are 18 or over, and when.
          Your date of birth itself is not stored or sent to us. If the date shows you are under 18, the sign-in is deleted
          straight away and we keep nothing about you; your device remembers, on the device only, not to allow a new sign-up
          until your 18th birthday.</li>
        <li><b>Profile and preferences.</b> Details you add to your profile and your email preferences.</li>
        <li><b>Account activity.</b> When your account was created and last signed in, daily counts of how much you use your
          account's features (API and AI-assistant connector calls, per key and per endpoint or tool), the API keys you create
          (name, a short prefix and when it was created, last used or revoked; never the full key), and plan or upgrade requests you
          file from your dashboard.</li>
        <li><b>CricSynthesis Pro payments.</b> When you subscribe, Razorpay collects your payment details; we never see your card,
          UPI or bank details. We keep your plan, its status, the subscription reference Razorpay gives us and the dates your free
          day, paid period or renewal start and end, to turn Pro on and show your plan. Razorpay sends receipts to your email.</li>
        <li><b>Contact and access requests.</b> Name, work email, organisation and interest you enter in our forms.</li>
        <li><b>Job applications.</b> The details and resume you submit when you apply for a role, including optional details such
          as gender. We use them only to assess your application and contact you about it, and delete them within 12 months
          unless you ask us to keep them longer.</li>
        <li><b>API usage.</b> For API customers: API key, request counts, endpoints called, timestamps and IP addresses, used to
          enforce plan limits and keep the service secure.</li>
        <li><b>Android app.</b> If the app crashes, it sends a crash report (device model, operating system and app version, and
          technical details of the error). Crash reports are not linked to your account. If you turn on match alerts, your device
          is registered to receive them; we see only which alerts are subscribed to, not who you are. App usage analytics are
          described under <a href="#app-analytics">Android app analytics</a>.</li>
        <li><b>MatchSynth Lab inputs.</b> What-if simulations run on your device. The settings you choose are not sent to us.</li>
        <li><b>Stored on your device.</b> Your theme choice, alert choices, saved Lab settings and a cache of match data that
          lets the site and app load faster and work offline. These stay in your browser or app and you can clear them at any time.</li>
      </ul>
      <h3 id="cookies">Analytics and cookies</h3>
      <p>When you first visit the website we ask whether you agree to optional analytics cookies. Nothing optional is set or
        loaded until you choose, &quot;Reject all&quot; is as easy as &quot;Accept all&quot;, and you can change your mind at any time from
        &quot;Cookie settings&quot; at the bottom of every page (withdrawing deletes those cookies). We ask again after 12 months
        or if we add a new tool. We never use advertising cookies, and advertising features in Google Analytics are off.</p>
      <ul>
        <li><b>Google Analytics (optional, only with your consent).</b> Pages viewed and the features used (for example opening a
          match, running a MatchSynth Lab scenario, creating an API key), the website that sent you, approximate location
          (city/country), device and browser. Google Analytics does not log or store IP addresses. We don&apos;t send your name,
          email or account ID to it. Provided by Google LLC.</li>
        <li><b>Microsoft Clarity session recordings (optional, only with your consent).</b> Heatmaps and replays of how pages are
          used (clicks, taps, scrolling, mouse movement) so we can find confusing or broken parts of the site. Everything you
          type is hidden, and the account, sign-in and connect pages are fully masked. Provided by Microsoft Corporation.</li>
        <li><b>Visit statistics (always on, no cookies).</b> Cloudflare Web Analytics counts page views and page speed without
          cookies or any identifier and without tracking you across sites; we see totals only.</li>
        <li><b>Sign-in storage (necessary).</b> When you sign in, Firebase Authentication keeps your session in your browser&apos;s
          storage so you stay signed in. Signing out removes it.</li>
        <li><b>Your choices (necessary).</b> Your theme and your cookie choice are remembered in your browser.</li>
        <li><b>Admin console (necessary).</b> Our internal admin console uses one session cookie for staff sign-in, only on that
          console&apos;s address.</li>
      </ul>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Set by</th><th>Purpose</th><th>Kept for</th><th>Optional?</th></tr></thead>
        <tbody>
          <tr><td data-label="Name">_ga, _ga_*</td><td data-label="Set by">Google Analytics</td><td data-label="Purpose">Tells visits apart and counts returning visitors, anonymously</td><td data-label="Kept for">Up to 13 months</td><td data-label="Optional?">Yes (Analytics)</td></tr>
          <tr><td data-label="Name">_clck, _clsk, CLID, MUID</td><td data-label="Set by">Microsoft Clarity</td><td data-label="Purpose">Links pages of one visit for recordings and heatmaps</td><td data-label="Kept for">_clsk 1 day; others up to 1 year</td><td data-label="Optional?">Yes (Session recordings)</td></tr>
          <tr><td data-label="Name">cs-consent (browser storage)</td><td data-label="Set by">CricSynthesis</td><td data-label="Purpose">Remembers your cookie choice</td><td data-label="Kept for">12 months</td><td data-label="Optional?">No</td></tr>
          <tr><td data-label="Name">cs-theme (browser storage)</td><td data-label="Set by">CricSynthesis</td><td data-label="Purpose">Light or dark theme</td><td data-label="Kept for">Until cleared</td><td data-label="Optional?">No</td></tr>
          <tr><td data-label="Name">Firebase sign-in (browser storage)</td><td data-label="Set by">Firebase Authentication</td><td data-label="Purpose">Keeps you signed in</td><td data-label="Kept for">Until you sign out</td><td data-label="Optional?">No</td></tr>
          <tr><td data-label="Name">__Host-cs_admin</td><td data-label="Set by">CricSynthesis (admin console only)</td><td data-label="Purpose">Staff sign-in session</td><td data-label="Kept for">8 hours</td><td data-label="Optional?">No</td></tr>
        </tbody>
      </table></div>
      <p>The Android app does not use these cookies.</p>
      <h3 id="app-analytics">Android app analytics</h3>
      <p>The app asks you to accept this privacy policy when you first open it (and again when the policy changes). Once you
        accept, the app uses Google Analytics for Firebase (Google LLC) to count how it is used: which screens are opened,
        features such as running MatchSynth Lab, turning on alerts or signing in, plus the app version, device model, operating
        system, language and approximate country. It uses a random app-instance ID, not your name or email, and it never uses the
        advertising ID; ad personalisation is off. Nothing is collected before you accept. You can switch it off at any time in
        the app under Settings → Privacy → &quot;Share anonymous usage analytics&quot;. The data is reported in aggregate in the same
        Google Analytics property as the website and kept for up to 14 months.</p>

      <h2>3. How we use it</h2>
      <ul>
        <li>To sign you in and give your account its plan features.</li>
        <li>To answer requests, issue API keys and provide support.</li>
        <li>To send account emails such as a welcome message and important service notices, and, if your email preferences allow,
          product updates. You can change email preferences in your account at any time.</li>
        <li>To enforce rate limits and these terms, and to protect the service against abuse.</li>
        <li>To run the service: authorised CricSynthesis staff can view account records (the account details, activity, keys and
          requests described above) in an internal, access-controlled admin console, to support you, review plans and upgrade
          requests, and spot problems or misuse. Every staff sign-in is logged.</li>
        <li>To fix crashes and understand aggregate usage so we can improve the product.</li>
      </ul>
      <p>We process your data on the basis of the consent you give when you create an account, submit a form or turn on a
        feature, and where it is needed to provide the service you asked for or to meet a legal obligation. We don't sell,
        rent or trade personal information, and we don't use it for advertising.</p>

      <h2>4. Service providers and transfers</h2>
      <p>The website, API and visit statistics run on Cloudflare (Cloudflare, Inc.); sign-in, storage, app notifications, data
        processing and, if you agree, website analytics (Google Analytics) run on Google Cloud, Firebase and Google Analytics
        (Google LLC); if you agree, session recordings run on Microsoft Clarity (Microsoft Corporation); subscription payments are processed by
        Razorpay (Razorpay Software Private Limited, India); and contact forms and email
        are handled by our email and workspace providers. These providers process data on our behalf under their own security
        and privacy commitments. Data is stored on servers in the United States. We may also disclose information where the
        law requires it.</p>

      <h2>5. Retention</h2>
      <p>Account data is kept while your account is active and deleted within 30 days of a deletion request, except where the
        law requires us to keep a record. Daily usage counts are kept for up to 13 months; other API usage logs and crash
        reports are kept only as long as needed for security, billing and fixing problems. Job applications are kept as described above.</p>

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
      <p>CricSynthesis accounts are only for people aged 18 and over, and we don&apos;t knowingly process personal data of anyone
        under 18. We check age when an account is first used (see &quot;Age confirmation&quot; above) and decline anyone under 18
        without keeping their details. If you believe someone under 18 has an account or has given us personal data, contact
        us and we&apos;ll delete it promptly.</p>

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
