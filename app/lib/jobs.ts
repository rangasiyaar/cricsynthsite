// Open roles on the careers page. Each job has its own page (/careers/<slug>/) and application form
// (/careers/<slug>/apply/); applications go to the sign-ups Apps Script (infra/apps-script/registration.gs).
export type Job = {
  slug: string; title: string; team: string; type: string; location: string; posted: string;
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
    posted: "2026-10-29",
    summary: "Design the graphics our API delivers to customers and produce our short-form video for Instagram.",
    intro: [
      "CricSynthesis builds cricket forecasts from ball-by-ball simulation. Fans use our match centre; businesses use our API for " +
        "analytics, projections and ready-made graphics.",
      "This is our first design hire. You will be responsible for two things: the graphics our API returns to customers, and our " +
        "short-form video on Instagram. You will work directly with the founders and set the visual standard for the company.",
    ],
    sections: [
      {
        title: "Responsibilities",
        groups: [
          {
            title: "API graphics",
            items: [
              "Design templates for match previews, win probability, projected scores, player and matchup cards, fantasy line-ups and post-match reviews.",
              "Maintain one design system across light and dark themes and four formats: 1:1, 4:5, 9:16 and 16:9.",
              "Deliver production-ready SVG and work with engineering on data cases such as long names, ties and reduced overs.",
              "Own the brand guidelines: logo, colour, typography, iconography and chart styles.",
            ],
          },
          {
            title: "Short-form video",
            items: [
              "Plan and edit three to five Instagram Reels a week from our forecasts, results and Scenario Lab.",
              "Animate charts and figures, and write on-screen text and subtitles.",
              "Turn around match-day edits within a few hours of team announcements.",
              "Review Instagram performance each week and adjust formats accordingly.",
            ],
          },
        ],
      },
      {
        title: "Requirements",
        groups: [{
          items: [
            "Two or more years of professional experience in graphic design, motion design or video editing.",
            "A portfolio that includes data-led graphics and short-form video.",
            "Strong typography, layout and colour skills, and care for numerical accuracy.",
            "Working knowledge of cricket formats and statistics.",
            "Clear written English.",
          ],
        }],
      },
      {
        title: "Tools",
        groups: [
          { title: "Required", items: ["Figma", "Adobe Illustrator or Affinity Designer", "Adobe After Effects", "Adobe Premiere Pro or DaVinci Resolve", "Adobe Photoshop"] },
          { title: "Preferred", items: ["CapCut", "Lottie or Rive", "Basic HTML, CSS and SVG", "Meta Business Suite and Instagram Insights"] },
        ],
      },
      {
        title: "Preferred",
        groups: [{ items: ["Experience with sports, broadcast or media graphics.", "A background in data visualisation.", "Hindi, for captions and on-screen text."] }],
      },
      {
        title: "Eligibility",
        groups: [{ items: ["Based in India and legally able to work in India.", "Available to work full-time, Monday to Friday, in Indian Standard Time.", "Your own laptop and a reliable internet connection."] }],
      },
      {
        title: "Compensation",
        groups: [{ items: ["Full-time position. Compensation is discussed with shortlisted candidates."] }],
      },
      {
        title: "Hiring process",
        groups: [{ items: ["Application review.", "A short design and editing assignment based on a real forecast.", "Interview with the founders.", "Offer."] }],
      },
    ],
  },
];

export const jobPath = (slug: string) => `/careers/${slug}/`;
export const jobBySlug = (slug: string) => JOBS.find((j) => j.slug === slug)!;
