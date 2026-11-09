# Instagram carousels

`cricsim/social` makes a six-slide carousel and caption for every covered match and **emails them to you 20 minutes
before the posting time** (two hours before the start), whether or not the playing XIs are out. You save the six
images on your phone, paste the caption, and post. It runs inside the Auto loop (`.github/workflows/auto.yml`, a pass
every 5 minutes) and remembers which matches it handled in `cricsim/social/posted.json`.

- **Covered:** Women's Big Bash League, Nepal Premier League, and internationals between two Test-playing nations
  (men's and women's): India, Australia, England, South Africa, New Zealand, Pakistan, Sri Lanka, West Indies,
  Bangladesh, Afghanistan, Ireland, Zimbabwe. A sides, Lions and age-group teams are left out. Edit `LEAGUES` and
  `TEST_NATIONS` in `cricsim/src/cricsim/social/__init__.py` to change it.
- **The email:** subject "Post at 6:30 PM IST: IND v NZ · …", the six slides attached in order (`indvnz-1.jpg` …
  `indvnz-6.jpg`) and the caption in the body, ready to copy.
- **Slides** (one per block of the match Overview, `carousel.html`): projected scores with the win chance, key duel,
  fall of wickets, players to watch, the ground, fantasy picks with the link.

## Set up the email (one time)

1. Sign in at **resend.com**. The domain `cricsynthesis.in` must show as **Verified** under *Domains* (its DNS
   records are already in Cloudflare; if it isn't listed, add it and copy the records Resend shows into Cloudflare DNS).
2. *API Keys* → **Create API key**, permission *Sending access*, domain `cricsynthesis.in`. Copy the key.
3. In GitHub → repo **Settings → Secrets and variables → Actions**:
   - secret `RESEND_API_KEY`: the key;
   - secret `SOCIAL_EMAIL_TO`: the address to receive the carousels (several: separate with commas);
   - variable `SOCIAL_ENABLED` = `true`;
   - optional variable `SOCIAL_FROM`, e.g. `CricSynthesis <social@cricsynthesis.in>` (that's the default).
4. Start **Actions → Auto → Run workflow** (or wait for the next run, within about 5½ hours).

The log of the running Auto job shows `<match-id>: emailed (<id>)` for each one. Remove `SOCIAL_ENABLED` to stop.

Try it without sending:

```bash
uv run python -m cricsim.social preview --match <match-id> --out /tmp/carousel    # slides + caption.txt
uv run python -m cricsim.social run --state cricsim/social/posted.json --dry-run   # what is due now
```

## Optional: post directly instead

Without the two email secrets and with `IG_ACCESS_TOKEN` and `IG_USER_ID` set (an Instagram Business account linked
to a Facebook Page, and a Meta system-user token with `instagram_basic` and `instagram_content_publish`), the
carousel is published automatically at exactly start minus two hours. The images are then served from the
repository's `social` branch, because Instagram fetches them from public URLs.
