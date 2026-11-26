import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = seo("/privacy/", "Privacy policy | CricSynthesis", "How CricSynthesis collects, uses and protects your information.");

const KEEP: [string, string][] = [
  ["Your account (details, profile, preferences, plan)", "While your account is open; deleted within 30 days of a deletion request"],
  ["Daily usage counts (API and AI-assistant calls)", "Up to 13 months"],
  ["Where and how you sign in", "In detail for 3 days; after that only the latest device, app version and approximate location, while your account is open"],
  ["Pro plan and subscription records", "While your account is open, and longer only where the law requires a record of payments"],
  ["Payment problems", "12 months"],
  ["Contact form messages", "Up to 24 months"],
  ["Job applications", "Up to 12 months, unless you ask us to keep them longer"],
  ["App crash reports", "Only as long as needed to fix the problem"],
  ["Match alert registration", "Until you turn alerts off or uninstall the app"],
  ["Google Analytics (website and app)", "Up to 14 months"],
];

const STORAGE: [string, string, string, string, string][] = [
  ["_ga, _ga_*", "Google Analytics", "Tells visits apart and counts returning visitors, anonymously", "Up to 13 months", "Yes (Analytics)"],
  ["_clck, _clsk, CLID, MUID", "Microsoft Clarity", "Links pages of one visit for recordings and heatmaps", "_clsk 1 day; others up to 1 year", "Yes (Session recordings)"],
  ["cs-consent (browser storage)", "CricSynthesis", "Remembers your cookie choice", "12 months", "No"],
  ["cs-theme (browser storage)", "CricSynthesis", "Light or dark theme", "Until cleared", "No"],
  ["Sign-in session (browser storage)", "CricSynthesis", "Keeps you signed in", "Until you sign out", "No"],
  ["Saved settings and match cache (browser or app storage)", "CricSynthesis", "Alert choices, saved MatchSynth Lab scenarios and match data, so pages load fast and work offline", "Until cleared", "No"],
  ["__Host-cs_admin", "CricSynthesis (admin console only)", "Staff sign-in session", "8 hours", "No"],
];

export default function Privacy() {
  return (
    <Legal title="Privacy Policy" subtitle="Effective 26 November 2026">
      <h2>1. Who we are</h2>
      <p>CricSynthesis runs a cricket match centre and Android app for fans, and an analytics, simulation and graphics API for
        businesses. CricSynthesis is currently operated by an individual based in India, who is the data fiduciary for the
        personal data described here. This policy explains what we collect when you use the website, the app, an account or
        the API, how we use it and the choices you have. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023.</p>

      <h2>2. In short</h2>
      <ul>
        <li>You can read forecasts on the website without an account. Signing in is needed for your account features, Pro and the API.</li>
        <li>We never see your password, your date of birth or your card, UPI or bank details, and we don&apos;t store your network address.</li>
        <li>Website analytics and session recordings run only if you agree. App analytics run only after you accept this policy, and you can switch them off.</li>
        <li>We don&apos;t sell your data or use it for advertising.</li>
      </ul>

      <h2>3. What we collect</h2>
      <h3>Your account</h3>
      <ul>
        <li><b>Account details.</b> When you sign in with Google or with email and password we receive your name, email address,
          profile picture (Google only) and a user ID. Passwords are handled by our sign-in system; we never see them.</li>
        <li><b>Age confirmation.</b> We keep only a record that you confirmed you are 18 or over, and when. See
          {" "}<a href="#age">Age and children</a>.</li>
        <li><b>Profile and preferences.</b> Details you add to your profile, such as your company and what you use CricSynthesis
          for, and your email preferences.</li>
      </ul>

      <h3>How you use your account</h3>
      <ul>
        <li><b>Account usage.</b> When your account was created and last signed in; daily counts of API and AI-assistant connector
          calls, per key and per endpoint or tool, with timestamps; the API keys you create (name, a short prefix and when each was
          created, last used or revoked, never the full key); and plan or upgrade requests you file from your dashboard.</li>
        <li id="sign-in-activity"><b>Where and how you sign in.</b> While you&apos;re signed in, each time you open the website or the
          app we record when, whether it was the website or the app, your device type, operating system, browser or app version,
          and an approximate location (city, region and country) worked out from your network address. We don&apos;t store the
          network address itself. This is part of running and securing your account, so it applies to every signed-in account and
          isn&apos;t covered by the cookie choice or the app&apos;s analytics switch. Visitors who aren&apos;t signed in are not recorded.</li>
      </ul>

      <h3>Payments</h3>
      <ul>
        <li><b>CricSynthesis Pro.</b> When you subscribe, our payment partner collects your payment details; we never see your
          card, UPI or bank details. We keep your plan, its status, the subscription reference our payment partner gives us and the
          dates your free day, paid period or renewal start and end, to turn Pro on and show your plan. Receipts are sent to your email.</li>
        <li id="payment-problems"><b>Payment problems.</b> If a payment or renewal doesn&apos;t go through, the checkout runs into an
          error, or you close the payment window before paying, we record what happened and when, the reason our payment partner
          gives (for example, declined by the bank or UPI request expired), the step where it stopped, whether it was on the website
          or the app, your plan and your device type (Android, iPhone or computer).</li>
      </ul>

      <h3>Forms you send us</h3>
      <ul>
        <li><b>Contact and API access requests.</b> Your name, email, organisation, topic, interest and message.</li>
        <li><b>Job applications.</b> The details and resume you submit, including optional details such as gender. We use them only
          to assess your application and contact you about it.</li>
        <li><b>Spam protection.</b> These forms run a privacy-friendly check that you&apos;re a person, which looks at basic browser
          signals, sets no tracking cookies and isn&apos;t used for advertising. To limit repeat submissions we keep only a one-way code
          of your network address, never the address itself.</li>
      </ul>

      <h3>The Android app</h3>
      <ul>
        <li><b>Crash reports.</b> If the app crashes, it sends a report with the device model, operating system, app version and
          technical details of the error. Crash reports are not linked to your account.</li>
        <li><b>Match alerts.</b> If you turn on alerts, your device is registered to receive them; we see only which alerts are
          subscribed to, not who you are.</li>
        <li><b>Usage analytics.</b> See <a href="#app-analytics">App analytics</a>.</li>
      </ul>

      <h3>What stays with you</h3>
      <ul>
        <li>MatchSynth Lab scenarios run on your device; the settings you choose are not sent to us.</li>
        <li>Your date of birth is checked on your device and never sent to us.</li>
        <li>Your theme, alert choices, saved Lab scenarios and cached match data stay in your browser or app (listed under
          {" "}<a href="#cookies">Cookies and device storage</a>), and you can clear them at any time.</li>
      </ul>

      <h2>4. Analytics and cookies</h2>
      <h3>On the website</h3>
      <p>When you first visit the website we ask whether you agree to optional analytics. Nothing optional is set or loaded until
        you choose, &quot;Reject all&quot; is as easy as &quot;Accept all&quot;, and you can change your mind at any time from &quot;Cookie
        settings&quot; at the bottom of every page (withdrawing deletes those cookies). We ask again after 12 months or if we add a
        new tool. We never use advertising cookies, and advertising features in Google Analytics are off.</p>
      <ul>
        <li><b>Google Analytics (optional).</b> Pages viewed and features used (for example opening a match, running a MatchSynth
          Lab scenario or creating an API key), the website that sent you, approximate location (city and country), device and
          browser. Google Analytics does not log or store IP addresses, and we don&apos;t send it your name, email or account ID.</li>
        <li><b>Microsoft Clarity session recordings (optional).</b> Heatmaps and replays of how pages are used (clicks, taps,
          scrolling, mouse movement) so we can find confusing or broken parts of the site. Everything you type is hidden, and the
          account, sign-in and connect pages are fully masked.</li>
        <li><b>Visit statistics (always on).</b> Our hosting provider counts page views and page speed without cookies or any
          identifier and without tracking you across sites; we see totals only.</li>
      </ul>

      <h3 id="app-analytics">In the app</h3>
      <p>The app asks you to accept this privacy policy when you first open it, and again when the policy changes. Once you
        accept, it uses Google Analytics for Firebase to count how the app is used: screens opened; features such as running
        MatchSynth Lab, turning on alerts or signing in; when the app is installed, updated or uninstalled; and the app version,
        device model, operating system, language and approximate country. It uses a random app-instance ID, never your name,
        email or advertising ID, and ad personalisation is off. Nothing is collected before you accept, and you can switch it off
        at any time under Settings → Privacy → &quot;Share anonymous usage analytics&quot;. It is reported in aggregate, together with
        the website&apos;s analytics. The app does not use website cookies.</p>

      <h3 id="cookies">Cookies and device storage</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Set by</th><th>Purpose</th><th>Kept for</th><th>Optional?</th></tr></thead>
        <tbody>
          {STORAGE.map(([name, by, purpose, kept, optional]) => (
            <tr key={name}><td data-label="Name">{name}</td><td data-label="Set by">{by}</td><td data-label="Purpose">{purpose}</td>
              <td data-label="Kept for">{kept}</td><td data-label="Optional?">{optional}</td></tr>
          ))}
        </tbody>
      </table></div>

      <h2>5. How we use your information</h2>
      <ul>
        <li>To sign you in and give your account its plan features, including Pro and API access.</li>
        <li>To answer requests, issue API keys and provide support.</li>
        <li>To send account emails, such as a welcome message, plan and payment notices and important service notices, and, if your
          email preferences allow, product updates. You can change email preferences in your account at any time.</li>
        <li>To find and fix problems with checkout and payments, on the website and in the app.</li>
        <li>To keep accounts and the service secure: enforcing rate limits and our terms, and spotting misuse or unusual sign-ins,
          such as the same account used in far-apart places within a short time.</li>
        <li>To fix crashes and understand how the website and the app are used, in aggregate, so we can improve them.</li>
      </ul>
      <p>We process your data on the basis of the consent you give when you create an account, submit a form or turn on a
        feature, and where it is needed to provide the service you asked for or to meet a legal obligation. We don&apos;t sell,
        rent or trade personal information, and we don&apos;t use it for advertising.</p>

      <h2>6. Who can access it</h2>
      <ul>
        <li><b>Our team.</b> Authorised CricSynthesis staff can view account records in an internal, access-controlled admin
          console: account details, usage, API keys, requests, plan and payment problems, and the last 3 days of sign-in activity
          including device and approximate location. We use it to support you, review plans and upgrade requests, and spot
          problems or misuse. Every staff sign-in and action is logged.</li>
        <li><b>Service providers.</b> We use trusted providers for hosting and content delivery (which also works out the
          approximate location described above), sign-in, data storage and processing, app notifications and crash reports,
          payments, email, and, only if you agree, Google Analytics and Microsoft Clarity. They process data only on our behalf and
          under their own security and privacy commitments, and none of them may use it for their own advertising. Data is stored
          on servers in the United States.</li>
        <li><b>The law.</b> We may disclose information where the law requires it.</li>
      </ul>

      <h2>7. How long we keep it</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Information</th><th>Kept for</th></tr></thead>
        <tbody>
          {KEEP.map(([what, kept]) => <tr key={what}><td data-label="Information">{what}</td><td data-label="Kept for">{kept}</td></tr>)}
        </tbody>
      </table></div>
      <p>When you delete your account, everything linked to it is deleted, except records the law requires us to keep.</p>

      <h2>8. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>tell you what personal data we hold about you and how we use it;</li>
        <li>correct, complete or update it;</li>
        <li>delete it and close your account (you can also do this yourself from your account page);</li>
        <li>withdraw consent you have given (this won&apos;t affect processing already done, but some features may stop working);</li>
        <li>nominate another person to exercise these rights for you if you die or become unable to do so.</li>
      </ul>
      <p>Write to <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>. We may need to confirm your identity
        before acting, and we respond within 30 days.</p>

      <h2 id="age">9. Age and children</h2>
      <p>CricSynthesis accounts are only for people aged 18 and over, and we don&apos;t knowingly process personal data of anyone
        under 18. When you first sign in we ask for your date of birth and check it on your device; it is never sent to us or
        stored, and we keep only a record that you confirmed you are 18 or over, and when. If the date shows you are under 18,
        the sign-in is deleted straight away and we keep nothing about you; your device remembers, on the device only, not to
        allow a new sign-up until your 18th birthday. If you believe someone under 18 has an account or has given us personal
        data, contact us and we&apos;ll delete it promptly.</p>

      <h2>10. Security</h2>
      <p>All traffic is encrypted with TLS. API keys are stored only as hashes, and access to systems that hold personal data is
        restricted to the people who need it. No method of transmission or storage is completely secure. If a breach affects
        your personal data, we&apos;ll notify you and the authorities as the law requires.</p>

      <h2>11. Our forecasts and API customers</h2>
      <p>Forecasts are built from records of past matches and contain no personal data about you. API customers must not send
        personal data about their own end users in requests.</p>

      <h2>12. Grievances</h2>
      <p>For any concern about how we handle your data, contact our grievance officer at
        {" "}<a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>. We acknowledge complaints within 7 days and
        resolve them within 30 days. If you&apos;re not satisfied with our response, you may complain to the Data Protection Board
        of India.</p>

      <h2>13. Changes</h2>
      <p>We&apos;ll update this page and its effective date when the policy changes, and email account holders about significant changes.</p>

      <h2>14. Contact</h2>
      <p>Questions about privacy: <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
