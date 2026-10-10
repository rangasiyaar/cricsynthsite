# CricSynthesis — design direction

Brief: pre-match cricket forecasts from ball-by-ball simulation. Readers are cricket fans, fantasy players and
analysts at broadcasters and franchises. The page's job: understand the next match at a glance, then trust the
numbers enough to dig in.

## Direction: the scorecard

Cricket's own vernacular is the scorecard and the broadcast scoreboard: two sides, a score, a bar, tidy columns of
figures. The site reads like a well-set scorecard on a bright day — calm, legible, numerate — with the match itself as
the hero. One memorable element: the live engine, where the simulator visibly plays the match.

## Colour and type

Colours, fonts and type treatments are the website's own (`app/site.css`, from `css/theme.css`): steel blue and copper
team colours on light grey, Barlow Condensed headings and labels in uppercase, Barlow body, JetBrains Mono for code.
`app/design.css` only adds shape and layout on top.

Layout: 1240px column, strict symmetry — the match hero is a three-column scoreboard (team | context | team);
grids are 4×2 tiles, 2×2 charts, full-width panels. Left-aligned text inside cards, centred only in the scoreboard.

## Rules

- No corner-tick frames; keep the site's colour tokens and type.
- Cards: 12px radius, 1px line, a hairline shadow; buttons 8px radius, sentence case.
- Section headings say what the reader learns ("How the innings unfold"), with one plain sentence under them.
