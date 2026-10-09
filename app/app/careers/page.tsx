import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Careers | CricSynthesis" };

export default function Careers() {
  return (
    <Legal title="Careers" subtitle="Come build the future of cricket intelligence.">
      <p>We're not hiring right now, but we're always open to hearing from exceptional people. If you're passionate about cricket,
        simulation and statistics, or building developer tools, reach out at <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
