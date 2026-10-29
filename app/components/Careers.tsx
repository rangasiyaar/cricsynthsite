// Careers: the list of openings and each job's page, in the website's legal-page layout.
import Link from "next/link";
import { JOBS, applyPath, jobPath, type Job } from "@/lib/jobs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const posted = (d: string) => { const [y, m, day] = d.split("-").map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };

export function JobList() {
  return (
    <div className="jobs">
      <p className="jobs-count">{JOBS.length} open {JOBS.length === 1 ? "position" : "positions"}</p>
      <ul className="jobs-list">
        {JOBS.map((j) => (
          <li key={j.slug} className="job-row">
            <Link href={jobPath(j.slug)} className="job-row-main">
              <span className="job-row-title">{j.title}</span>
              <span className="job-row-summary">{j.summary}</span>
              <span className="job-row-meta">{j.team} · {j.type} · {j.location} · {j.experience}</span>
            </Link>
            <Link href={applyPath(j.slug)} className="cs-btn cs-btn--primary job-row-apply"><span>Apply</span></Link>
          </li>
        ))}
      </ul>
      <p className="jobs-note">No role that fits? Send your CV to <a href="mailto:hello@cricsynthesis.in">hello@cricsynthesis.in</a>.</p>
    </div>
  );
}

export function JobMeta({ job }: { job: Job }) {
  return (
    <dl className="job-meta">
      <div><dt>Team</dt><dd>{job.team}</dd></div>
      <div><dt>Type</dt><dd>{job.type}</dd></div>
      <div><dt>Location</dt><dd>{job.location}</dd></div>
      <div><dt>Experience</dt><dd>{job.experience}</dd></div>
      <div><dt>Posted</dt><dd>{posted(job.posted)}</dd></div>
    </dl>
  );
}

export function JobDetail({ job }: { job: Job }) {
  return (
    <div className="job">
      <p className="job-back"><Link href="/careers/">← All openings</Link></p>
      <h2 className="job-title">{job.title}</h2>
      <JobMeta job={job} />
      {job.intro.map((p, i) => <p key={i}>{p}</p>)}
      {job.sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.groups.map((g, i) => (
            <div key={i}>
              {g.title && <h3>{g.title}</h3>}
              <ul>{g.items.map((it) => <li key={it}>{it}</li>)}</ul>
            </div>
          ))}
        </section>
      ))}
      <p className="job-cta job-cta--end"><Link href={applyPath(job.slug)} className="cs-btn cs-btn--primary"><span>Apply for this role</span></Link></p>
    </div>
  );
}
