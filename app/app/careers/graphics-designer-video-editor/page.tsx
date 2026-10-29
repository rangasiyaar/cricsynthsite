import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import Legal from "@/components/Legal";
import { JobDetail } from "@/components/Careers";
import { jobBySlug, jobPath } from "@/lib/jobs";

const job = jobBySlug("graphics-designer-video-editor");

export const metadata: Metadata = seo(jobPath(job.slug), `${job.title} | Careers | CricSynthesis`,
  `${job.type}, ${job.location}. ${job.summary}`);

export default function Page() {
  return (
    <Legal title="Careers" subtitle="Join the team building cricket forecasts from ball-by-ball simulation.">
      <JobDetail job={job} />
    </Legal>
  );
}
