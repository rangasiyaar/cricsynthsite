// Blog posts: the list page, sitemap and each post's metadata read from here.
export const AUTHOR = { name: "Saurav Kumar", role: "Founder, CricSynthesis" };

export type Post = { slug: string; title: string; description: string; date: string; minutes: number; tags: string[] };

export const POSTS: Post[] = [
  {
    slug: "does-the-ground-matter-t20-venue-analysis",
    title: "Does the ground really matter? What 1.7 million T20 balls say about venues",
    description: "We tested common beliefs about T20 grounds against 1.7 million deliveries: par scores, powerplay pitches, pace v spin, and when wickets fall. Here is what held up and what did not.",
    date: "2026-10-13",
    minutes: 9,
    tags: ["Venue analysis", "T20", "Methodology"],
  },
];

export const postPath = (slug: string) => `/blog/${slug}/`;

export function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
