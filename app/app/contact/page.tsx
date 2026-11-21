import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import RequestAccess from "@/components/RequestAccess";

export const metadata: Metadata = seo("/contact/", "Contact | CricSynthesis", "Questions about forecasts, CricSynthesis Pro, API access or partnerships? Send the CricSynthesis team a message.");

export default function Contact() {
  return (
    <>
      <section className="legal-page" style={{ paddingBottom: 0 }}>
        <div className="legal-header">
          <h1 className="legal-title">Contact</h1>
          <p className="legal-subtitle">Partnerships, API access and general enquiries.</p>
        </div>
      </section>
      <ContactForm />
      <RequestAccess />
    </>
  );
}
