import Link from "next/link";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { AUTHOR, BLOG_IMAGE, POSTS, postPath, prettyDate } from "@/lib/blog";

export const metadata: Metadata = seo("/blog/", "Cricket analytics blog | CricSynthesis",
  "Evidence-based writing on T20 cricket: venues, scoring trends, player form and how our match forecasts are built and checked.", { image: BLOG_IMAGE });

export default function Blog() {
  return (
    <div className="page-head blog" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">Blog</p>
      <h1 className="cs-h2">Notes from the data</h1>
      <p className="cs-lede">What the numbers say about cricket, how we test it, and where our forecasts still go wrong.</p>
      <div className="blog-list">
        {POSTS.map((p) => (
          <Link key={p.slug} href={postPath(p.slug)} className="blog-card">
            <span className="blog-meta">{prettyDate(p.date)} · {p.minutes} min read</span>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <span className="blog-meta">{AUTHOR.name}, {AUTHOR.role}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
