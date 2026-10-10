# CricSynthesis — design direction

Brief: pre-match cricket forecasts from ball-by-ball simulation. Readers are cricket fans, fantasy players and
analysts at broadcasters and franchises. The page's job: understand the next match at a glance, then trust the
numbers enough to dig in.

## Direction: the scorecard

Cricket's own vernacular is the scorecard and the broadcast scoreboard: two sides, a score, a bar, tidy columns of
figures. The site reads like a well-set scorecard on a bright day — calm, legible, numerate — with the match itself as
the hero. One memorable element: the live engine, where the simulator visibly plays the match.

## Tokens

| Role | Light | Dark |
|---|---|---|
| Page | `#F3F5F4` cool grandstand white | `#0E1822` stadium night |
| Card | `#FFFFFF` | `#142231` |
| Ink | `#16202E` scoreboard navy | `#E8EEF2` |
| Field (actions, brand) | `#0F7A4F` outfield green | `#38B07A` |
| Team A | `#1F5FBF` | `#6EA2F0` |
| Team B | `#C23A2B` ball red | `#F07B6B` |
| Line | `#DCE2E6` | `#22354A` |

Type: one family, Archivo (variable width). Headings 700 at 82% width, sentence case; body 400 at normal width;
every number tabular. Monospace only for code.

Layout: 1240px column, strict symmetry — the match hero is a three-column scoreboard (team | context | team);
grids are 4×2 tiles, 2×2 charts, full-width panels. Left-aligned text inside cards, centred only in the scoreboard.

## Rules

- No all-caps labels, no eyebrow over every heading, no mono data labels, no corner-tick frames.
- Cards: 12px radius, 1px line, a hairline shadow; buttons 8px radius, sentence case.
- Motion: the live engine and the win bar are the only automatic movement. No entrance animation on every card.
- Section headings say what the reader learns ("How the innings unfold"), with one plain sentence under them.
