// Blog posts: the list page, sitemap and each post's metadata read from here.
// photo: put the image at public/authors/saurav-kumar.jpg and set photo to "/authors/saurav-kumar.jpg"; until then a monogram shows.
export const AUTHOR: { name: string; role: string; photo?: string; bio: string } = {
  name: "Saurav Kumar", role: "Founder, CricSynthesis",
  bio: "Saurav Kumar founded CricSynthesis to forecast cricket the way it is played: ball by ball, from the real XIs, and checked in public after every match.",
};

export type Post = { slug: string; title: string; description: string; date: string; minutes: number; tags: string[] };

export const POSTS: Post[] = [
  {
    slug: "does-the-ground-matter-t20-venue-analysis",
    title: "Does the ground really matter? What 1.7 million T20 balls say about venues",
    description: "We tested common beliefs about T20 grounds against 1.7 million deliveries: par scores, powerplay pitches, pace v spin, men's v women's matches and when wickets fall. Six charts on what held up and what did not.",
    date: "2026-10-13",
    minutes: 16,
    tags: ["Venue analysis", "T20", "Methodology"],
  },
];

export const BLOG_IMAGE = "/og-logo.png?v=1";   // link previews for the blog: the logo on its own

export const postPath = (slug: string) => `/blog/${slug}/`;

export function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
