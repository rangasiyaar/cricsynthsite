import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Careers | CricSynthesis" };

export default function Careers() {
  return (
    <Legal title="Careers" subtitle="Help build the simulation engine behind modern cricket analysis.">
      <p>No open roles at the moment. You can write to <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a>.</p>
    </Legal>
  );
}
