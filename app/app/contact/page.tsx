import type { Metadata } from "next";
import Legal from "@/components/Legal";
import RequestAccess from "@/components/RequestAccess";

export const metadata: Metadata = { title: "Contact | CricSynthesis" };

export default function Contact() {
  return (
    <>
      <Legal title="Contact">
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
