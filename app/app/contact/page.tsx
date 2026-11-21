import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import Legal from "@/components/Legal";
import RequestAccess from "@/components/RequestAccess";

export const metadata: Metadata = seo("/contact/", "Contact | CricSynthesis", "Questions about forecasts, CricSynthesis Pro, API access or partnerships? Send the CricSynthesis team a message.");

export default function Contact() {
  return (
    <>
      <Legal title="Contact" subtitle="Partnerships, API access and general enquiries.">
        <p>Questions about forecasts, CricSynthesis Pro, the API or a partnership? Send us a message and we&apos;ll reply,
          usually within one working day.</p>
        <h2>Send us a message</h2>
        <ContactForm inline />
        <h2>Email us</h2>
        <ul>
          <li>General questions: <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a></li>
          <li>Privacy: <a href="mailto:privacy@cricsynthesis.in">privacy@cricsynthesis.in</a></li>
          <li>Legal: <a href="mailto:legal@cricsynthesis.in">legal@cricsynthesis.in</a></li>
        </ul>
      </Legal>
      <RequestAccess />
    </>
  );
}
