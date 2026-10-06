# GraphSynth broadcast SDK

Hosted at `https://cricsynthesis.in/sdk/`. Needs an API key on a plan that includes GraphSynth.

## In a web page

```html
<div id="wp" style="width:960px;height:540px"></div>
<script src="https://cricsynthesis.in/sdk/graphsynth.js"></script>
<script>
  GraphSynth.mount(document.getElementById("wp"), {
    apiKey: "cs_live_…", graphic: "win-probability", matchId: "ipl-2026-m042",
    theme: "broadcast_dark", refreshSeconds: 10,
  });
</script>
```

Graphics: `win-probability`, `score-projection` (live, refresh every few seconds),
`manhattan`, `worm`, `phases` (completed matches, `matchId: "m-1234567"`), `player-form` (`playerId`).

## OBS / vMix / CasparCG

Add a **Browser source** (OBS, vMix) or **HTML template** (CasparCG) pointing at:

```
https://cricsynthesis.in/sdk/overlay.html?key=cs_live_…&graphic=win-probability&match=ipl-2026-m042&theme=transparent&refresh=10
```

Set the source to 1920×1080. `theme=transparent` keys cleanly over video. Optional:
`home=#004ba0&away=#f9cd05` (team colours), `quiet=1` (hide error messages).

## Live data

Push your own scoring feed and the graphics follow it (visible only to your account):

```
POST https://api.cricsynthesis.in/v2/graphics/state
X-API-Key: cs_live_…
{"match_id": "ipl-2026-m042", "innings": 2, "batting": "away", "runs": 142, "wickets": 4,
 "overs": "16.2", "first_innings_total": 189}
```

Without your own feed, graphics use CricSynthesis's public live data when available, or the
pre-match simulation.

**Keys in overlays:** the key sits in the overlay URL on your broadcast machine. Use a separate
key per machine and revoke it from the dashboard if it leaks.
