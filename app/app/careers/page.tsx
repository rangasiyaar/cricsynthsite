import { seo } from "@/lib/seo";
import type { Metadata } from "next";
import Legal from "@/components/Legal";
import { JobList } from "@/components/Careers";

export const metadata: Metadata = seo("/careers/", "Careers | CricSynthesis", "Open positions at CricSynthesis.");

export default function Careers() {
  return (
    <Legal title="Careers" subtitle="Join the team building cricket forecasts from ball-by-ball simulation.">
      <JobList />
    </Legal>
  );
}
