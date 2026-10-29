// Open roles on the careers page. Each job has its own page (/careers/<slug>/) and application form
// (/careers/<slug>/apply/); applications go to the sign-ups Apps Script (kept outside the repo).
export type Job = {
  slug: string; title: string; team: string; type: string; location: string; experience: string; posted: string;
  summary: string; intro: string[];
  sections: { title: string; groups: { title?: string; items: string[] }[] }[];
};

export const JOBS: Job[] = [
  {
    slug: "graphics-designer-video-editor",
    title: "Graphics Designer & Video Editor",
    team: "Design",
    type: "Full-time",
    location: "Remote, India",
    experience: "1+ year",
    posted: "2026-10-29",
    summary: "Design the data graphics delivered through our API and produce Reels, posters and carousels for Instagram.",
    intro: [
      "We are looking for a Graphics Designer & Video Editor to design the data graphics delivered through the CricSynthesis API " +
        "and to produce our Instagram content: Reels, posters and carousels. The role reports to the founders.",
    ],
    sections: [
      {
        title: "Responsibilities",
        groups: [
          {
            title: "API graphics",
            items: [
              "Design and maintain templates for match previews, win probability, projected scores, player and matchup cards, fantasy teams and post-match summaries.",
              "Produce every template in light and dark themes and in 1:1, 4:5, 9:16 and 16:9 formats.",
              "Deliver production-ready SVG files and work with engineering on edge cases such as long player names, tied matches and reduced overs.",
              "Maintain the brand guidelines: logo usage, colour, typography, iconography and chart styles.",
            ],
          },
          {
            title: "Instagram",
            items: [
              "Edit and publish five to seven Reels a week from match forecasts, results and Scenario Lab outputs.",
              "Design posters and carousels for match previews, results and player statistics.",
              "Animate charts and figures, and write on-screen text and captions.",
              "Deliver match-day content within a few hours of team announcements.",
              "Track performance in Instagram Insights and refine formats based on the results.",
            ],
          },
        ],
      },
      {
        title: "Requirements",
        groups: [{
          items: [
            "At least one year of professional experience in graphic design, motion design or video editing.",
            "A portfolio that includes data-led graphics, social media posters and short-form video.",
            "Strong typography, layout and colour skills, with close attention to numerical accuracy.",
            "Working knowledge of cricket formats, scorecards and common statistics.",
            "Clear written English.",
          ],
        }],
      },
      {
        title: "Tools",
        groups: [
          { title: "Required", items: ["Figma", "Adobe Illustrator or Affinity Designer", "Adobe Photoshop", "Adobe After Effects", "Adobe Premiere Pro or DaVinci Resolve"] },
          { title: "Preferred", items: ["Claude Design", "CapCut", "Lottie or Rive", "Basic HTML, CSS and SVG", "Meta Business Suite and Instagram Insights"] },
        ],
      },
      {
        title: "Good to have",
        groups: [{ items: ["Experience with sports, broadcast or media graphics.", "A background in data visualisation.", "Hindi, for captions and on-screen text."] }],
      },
      {
        title: "Eligibility",
        groups: [{ items: ["Based in India and legally permitted to work in India.", "Available full-time, Monday to Friday, in Indian Standard Time.", "Own laptop and a reliable internet connection."] }],
      },
      {
        title: "Compensation",
        groups: [{ items: ["Compensation will be discussed with shortlisted candidates."] }],
      },
      {
        title: "Hiring process",
        groups: [{ items: ["Application review.", "Design and editing assignment.", "Interview.", "Offer."] }],
      },
    ],
  },
];

export const jobPath = (slug: string) => `/careers/${slug}/`;
export const applyPath = (slug: string) => `${jobPath(slug)}apply/`;
export const jobBySlug = (slug: string) => JOBS.find((j) => j.slug === slug)!;
