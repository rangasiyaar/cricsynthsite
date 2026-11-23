# CricSynthesis — design direction

Brief: pre-match cricket forecasts from ball-by-ball simulation. Readers are cricket fans, fantasy players and
analysts at broadcasters and franchises. The page's job: understand the next match at a glance, then trust the
numbers enough to dig in.

## Direction: the scorecard

Cricket's own vernacular is the scorecard and the broadcast scoreboard: two sides, a score, a bar, tidy columns of
figures. The site reads like a well-set scorecard on a bright day — calm, legible, numerate — with the match itself as
the hero. One memorable element: the live engine, where the simulator visibly plays the match.

## Colour and type

Colours, fonts and type treatments are the website's own (`app/site.css`): steel blue and copper
team colours on light grey, Barlow Condensed headings and labels in uppercase, Barlow body, JetBrains Mono for code.
`app/design.css` only adds shape and layout on top.

Layout: 1240px column, strict symmetry — the match hero is a three-column scoreboard (team | context | team);
grids are 4×2 tiles, 2×2 charts, full-width panels. Left-aligned text inside cards, centred only in the scoreboard.

## Rules

- **No corner ticks or corner crosses, anywhere.** They were the old frame style and are gone from the theme (no
  `::before` corner marks, no `.cs-frame > i`, no `--cs-corner`). Don't bring them back on cards, panels, popovers,
  graphics or marketing pages.
- Keep the site's colour tokens and type (`site.css`): `--cs-bg`, `--cs-ink`/`-2`/`-3`, `--cs-line`, `--cs-surface`,
  `--cs-steel-*`, `--cs-paper`, team colours `--team-a`/`--team-b`; Barlow Condensed uppercase headings, Barlow body.
  Every colour must come from a token so dark mode (`[data-theme="dark"]`) works without extra rules.
- Cards: 12px radius (`--r-card`), 1px `--cs-line` border, page background; buttons 8px radius (`--r-btn`), sentence case.
- Section cards: an `h3` title (condensed, uppercase) and the content; small labels inside use `.cs-k` (11px, uppercase,
  `.08em`, `--cs-ink-3`). No eyebrow above a card title.
- Anything that floats (popovers, menus, tooltips, the ⓘ panel): a card (12px radius, 1px line, solid `--cs-bg`, never
  transparent) with the menu shadow `0 10px 28px rgba(0,0,0,.14)`, drawn at the page's top level (React portal) so cards,
  animations or faded labels around it can't cover it or show through. On phones (≤640px) it becomes a bottom sheet
  (20px top corners, dimmed page behind).
- Explanations: every section with numbers or a chart gets the ⓘ (`components/Info.tsx`) after its title, with plain
  words in `lib/glossary.ts` (what it shows, how to read it, an example). The button is a 20px hairline circle in the
  text colours (`--cs-line` border, `--cs-ink-3` glyph), the same as the panel's close button: no fill, no accent colour.
- The Android app (`app/m/mobile.css`) uses the same tokens with app shapes: filled surfaces, corners in three sizes
  (8px small, 12px medium, 20px large).
- Section headings say what the reader learns ("How the innings unfold"), with one plain sentence under them.
- The Guide (`/docs/guide/`, app `/m/guide/`; content in `lib/guide.ts`) explains every analysis for fans. Its IP checklist
  (top of `lib/guide.ts`) applies to all explanatory copy, the ⓘ text included: say what a number means and how to use it,
  never how we make it (no counts, model names, weights, formulas, factor lists, research findings, team-building rules
  or MatchSynth Lab effect sizes). `/docs/` is the Docs home (Guide and API); the API reference is `/docs/api/`.
