# You called that? — reel script and technical sheet

A 15-second reel about one real match: **Australia v England, 2nd T20I, Carrara Oval, Tue 24 Nov 2026, 1:45 PM IST.**
Before the toss, a fan sends a call that CricSynthesis published. That evening the match goes the way they said, and
the friend who doubted them asks how. The reply is the link. It's a story between friends, so it reads as word of
mouth, not an ad, and it gives the viewer the friend's reason to visit.

**Rendered cut:** `reel/you-called-that.mp4` (Australia-win version). Sources: `reel/you-called-that.html` (picture),
`reel/you-called-that-overlay.html` (messages and end card).

## Specs

| | |
|---|---|
| Format | 9:16 vertical, 1080 × 1920, 30 fps, 15.0 s (450 frames) |
| Video | H.264 (libx264), preset slow, CRF 18, yuv420p, `+faststart` (about 4 MB) |
| Audio | AAC 192 kb/s, 48 kHz stereo, peak normalised to −1 dBFS (0.89) |
| Platforms | Instagram Reels, YouTube Shorts, WhatsApp Status; plays complete with the sound off |
| Safe area | Text stays 150 px clear of the top and 170 px of the bottom (platform UI) |
| Style | Silhouettes and flat light, as in *A Night at the Cricket*; grain overlay at 10%, soft vignette |

## Story beats

| # | Time | Picture | Sound | On screen |
|---|---|---|---|---|
| 1 | 0.00–3.00 s | **The table.** A phone lies face up on a dark wooden coffee table, a mug soft in the background. Blue TV light flickers across the wood. Slow push-in (scale 1.00 → 1.08, drift up 20 px). The screen lights at 0.25 s and again at 1.15 s, and the phone shivers on the wood each time. | Quiet room tone. A faint stadium crowd from the TV in the next room. Two phone buzzes rattle on the wood (0.25 s, 1.15 s). | Card 1 (0.25 s), sent by the fan: **You · 1:12 PM, before the toss** "Aussies by a whisker today. Marsh is the one to watch."<br>Card 2 (1.15 s): **Rohan · 5:04 PM** "Still backing Australia?" |
| 2 | 3.00–7.40 s | **The room.** Three friends from behind on a sofa, facing a TV: a floodlit ground, a crowd, the pitch. No teams or logos. Slow push toward the TV (scale +10% by 6.5 s). They lean forward during the run-up (from 4.5 s). The TV flashes white on the crack (6.48 s). At 6.95 s they jump up with fists in the air, light bursts from the screen, the camera shakes for 0.5 s and a soft white flash fills the frame. | The TV crowd builds through the run-up. The bowler's last strides (7 footfalls, 5.75–6.45 s). **The crack** (6.50 s). Half a beat of near-silence (6.55–6.95 s). Then the stadium erupts and the room with it: five voices shouting and claps. | Tag (3.3–7.2 s): **AUSTRALIA V ENGLAND · 2ND T20I** |
| 3 | 7.40–10.40 s | **The hand.** Back at the table. The phone buzzes (7.55 s). A hand comes in from the lower right (7.7–8.7 s) and lifts the phone towards the camera, levelling it and bringing it closer (8.6–10.2 s). | One longer buzz at 7.55 s. The stadium still roaring, fading slowly. | Card 3 (7.55 s): **Rohan · now** "NO WAY"<br>Card 4 (8.25 s): **Rohan · now** "Okay. How did you call that?" |
| 4 | 10.40–12.50 s | **The reply.** The phone in both hands, screen glowing, keyboard up, the room soft behind. The thumbs tap while the reply types out. Slow push-in (+4%). | 18 key taps (10.78–12.0 s) over the fading crowd. | Card 5 (10.45 s), typed on from 10.75 s to 12.0 s: **You** "Saw it before the toss → cricsynthesis.in", then **Delivered** (12.05 s) |
| 5 | 12.50–15.00 s | **End card.** Dark navy radial background. The CricSynthesis mark draws on (chevron 12.7 s, stumps 12.95 s, bails 13.35 s), the wordmark slides in (13.2 s), then the tagline (13.5 s) and the URL (13.7 s). | The crowd fades out over the last 1.2 s. | **CRICSYNTHESIS** · AI-Powered Cricket Intelligence · **cricsynthesis.in**<br>Small print (14.0 s): "Australia v England, 24 Nov 2026: Australia 54% to win in our forecast before the toss." |

## The call and the facts behind it

The fan's message is a call CricSynthesis really published for this match before the toss. Nothing on screen claims
more than the match page said.

| Call on the match page (before the toss) | Number | Used in |
|---|---|---|
| Australia win | 54% (England 46%) | Card 1, end-card small print (Australia-win version) |
| Mitchell Marsh, Australia's likeliest top scorer | 28% (42% for 30+) | Card 1 ("the one to watch") |
| Harry Brook, England's likeliest top scorer | 26% | England-win version |
| Adil Rashid, 2+ wickets | 30% | England-win version |
| Adam Zampa, 2+ wickets | 32% | Spare |

**Before the toss:** save a copy (screenshot or PDF) of
`cricsynthesis.in/match/aus-v-eng-t20i-queensland-2026-11-24/`. The forecast is re-run when the playing XIs are named,
so the copy is the record of what we said.

## Versions

Only the message copy and the end-card small print change; picture, timing and sound stay the same.

| Result | Card 1 (fan, before the toss) | Card 2 (Rohan) | Small print |
|---|---|---|---|
| **Australia win** (rendered) | Aussies by a whisker today. Marsh is the one to watch. | Still backing Australia? | Australia 54% to win in our forecast before the toss. |
| England win, Brook top-scores | England's night if Brook gets going. | Still backing Brook? | Harry Brook was England's likeliest top scorer in our forecast before the toss. |
| England win, Rashid 2+ wickets | Watch Rashid tonight. Two wickets, easy. | Still backing Rashid? | Adil Rashid: 30% chance of 2+ wickets in our forecast before the toss. |

If none of our calls come true, skip this match and run the reel on the next one.

## Design

**Colours (brand kit)**

| Use | Colour |
|---|---|
| Fan's message bubble | Steel 700 `#416180` at 94%, text paper `#f2f2f3`, avatar steel 400 `#94bce3` |
| Friend's message bubble | Paper `#f2f2f3` at 93%, text ink `#16181a`, avatar clay `#b0613a` |
| End card | Radial `#16263a` → `#0a1018`; mark and "SYNTHESIS" steel 400 `#94bce3`; "CRIC" paper; tagline `#8ea6bd`; small print `#6f8396` |
| Scenes | Wood `#2a1a12` → `#120a07`; night `#070b14`; TV light `#4f7fd6` / `#7fb4ff`; screen glow `#d9ecff`; silhouettes `#020306` / `#0a0706`; burst `#ffd27a` |

**Type**

| Element | Font |
|---|---|
| Message text | Barlow 500, 48 px, line height 1.22 |
| Sender row | Barlow 600, 30 px (time in 500 at 75% opacity) |
| Match tag | Barlow 600, 28 px, letter-spacing .16em, uppercase, on a dark glass pill |
| Wordmark | Barlow Condensed 600, 104 px, letter-spacing .04em, uppercase |
| Tagline / URL | Barlow 500 30 px (.14em, uppercase) / Barlow 600 46 px |

**Message cards:** radius 44 px, padding 30/40 px, 18 px backdrop blur, shadow `0 24px 70px rgba(0,0,0,.45)`, max width
780 px, 70 px side margins. Cards 1–4 sit at y = 300 px; the reply card at y = 1180 px (over the phone's screen).

**Motion**
- Cards enter with a spring: a 60 px rise and scale 0.94 → 1.00 over 0.55 s with a slight overshoot
  (`1 − cos(2.2πx)·e^(−6x)`), opacity in over 0.2 s, out over 0.25 s.
- Everything else uses a cubic ease-out (`1 − (1 − x)³`). Cuts between scenes are 0.1 s dissolves.
- The TV light flickers on a fixed sum of sines (7.1, 13.7 and 2.3 rad/s), so every render is identical.
- Phone buzz: ±7–8 px horizontal shake at 90 rad/s, decaying over 0.35–0.4 s.
- Celebration: friends rise 140–180 px with a bob, arms swing up over 0.2 s, camera shake ±10 px for 0.5 s, 26 light rays
  burst from the TV and fade by 7.4 s.

## Sound design

All sound is generated in code (numpy / scipy), so there are no licensing questions. No voice.

| Time | Cue | How it's made |
|---|---|---|
| 0–15 s | Room tone | Noise low-passed at 300 Hz, −38 dB, slightly delayed in one channel for width |
| 0–15 s | Stadium from the TV | Noise band-passed 250–2,500 Hz with a slow murmur, then "through a TV": band-pass 220–5,200 Hz plus a short room reverb (0.35 s). Builds from 2.4 s to 6.5 s |
| 0.25, 1.15 s | Phone buzz on wood | 170 Hz square wave + 85 Hz sine, pulsing at 14 Hz, low-passed at 900 Hz, plus a 1.5–5 kHz rattle |
| 5.75–6.45 s | Bowler's footfalls | 7 short noise bursts, band-passed 120–900 Hz, getting louder |
| 6.50 s | The crack | High-passed noise (1.8 kHz) with a falling 1,400 → 800 Hz tone, 0.4 s |
| 6.55–6.95 s | The silence | The crowd drops to 25% |
| 6.95 s → | The eruption | The stadium jumps (+0.55 gain, 80 ms attack, 4.5 s release); 5 voices (140–260 Hz with vibrato) and 9 claps in the room |
| 7.55 s | "NO WAY" buzz | A longer buzz (0.5 s) |
| 10.78–12.0 s | Typing | 18 taps, noise band-passed 2–7 kHz, 25 ms each |
| 13.8–15 s | Fade out | Everything fades over the last 1.2 s |

Loudness: the tense build-up sits around −28 dB RMS and the eruption around −17 dB, so the moment lands even on a phone
speaker.

## Build and render

Scripts in `reel/render/`. Requirements: Node with Playwright (Chromium), ffmpeg, uv. Fonts load from Google Fonts at
render time. Run from `marketing/reel/`:

```bash
# picture and overlay: 450 frames each at 30 fps (window.seek(t) draws time t)
node render/frames.cjs you-called-that.html out/bg 0 450
node render/frames.cjs you-called-that-overlay.html out/ov 0 450 --alpha     # transparent PNG

# soundtrack
uv run --no-project --with numpy --with scipy --with soundfile python render/sound.py out/sound.wav

# composite and encode
ffmpeg -framerate 30 -i out/bg/f%04d.png -framerate 30 -i out/ov/f%04d.png -i out/sound.wav \
  -filter_complex "[0][1]overlay=format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -shortest -movflags +faststart you-called-that.mp4
```

Rendering takes about 3 minutes on 4 CPU cores if each frame command runs as four workers in parallel (frame ranges
0–113, 113–226, 226–339, 339–450). The sound is deterministic: the same script always gives the same file.

**To make another version:** edit the copy of cards 1 and 2 and the small print in `you-called-that-overlay.html`,
re-render the overlay frames and composite again (about 10 minutes).

## Rules

- **Only calls we published**, worded as the page worded them ("likeliest top scorer", not "will score 70"). Keep the
  saved copy of the page.
- **Nothing official:** team and player names appear only in the messages and the tag. No players, kits, logos,
  broadcast footage or real commentators.
- **No betting language:** no odds, tips, bets or "sure things". The numbers are our forecast, stated as such.
- **Data credits** stay on the site's /credits/ page; no data source is named in the reel.
- **Post** within an hour of the result, while people are still talking about the match.

## Caption

> Called it before the toss. 🏏 Australia v England, 2nd T20I: Australia were 54% in our forecast, and Marsh was the one
> to watch. Every match, before it starts → cricsynthesis.in
>
> #AUSvENG #T20I #Cricket #CricketTwitter #MatchDay #CricSynthesis
