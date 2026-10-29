import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import Legal from "@/components/Legal";
import JobApplication from "@/components/JobApplication";
import { jobBySlug, jobPath } from "@/lib/jobs";

const job = jobBySlug("graphics-designer-video-editor");

export const metadata: Metadata = seo(`${jobPath(job.slug)}apply/`, `Apply: ${job.title} | CricSynthesis`,
  `Apply for the ${job.title} role at CricSynthesis.`, { noindex: true });

export default function Page() {
  return (
    <Legal title="Apply" subtitle={job.title}>
      <JobApplication job={job} />
    </Legal>
  );
}
