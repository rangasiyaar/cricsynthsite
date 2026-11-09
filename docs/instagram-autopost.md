# Instagram auto-posting

`cricsim/social` posts a six-slide carousel for every covered match, **two hours before the start**, whether or not
the playing XIs are out. It runs inside the Auto loop (`.github/workflows/auto.yml`, a pass every 5 minutes) and
remembers what it posted in `cricsim/social/posted.json`.

- **Covered:** Women's Big Bash League, Nepal Premier League, and internationals between two Test-playing nations
  (men's and women's): India, Australia, England, South Africa, New Zealand, Pakistan, Sri Lanka, West Indies,
  Bangladesh, Afghanistan, Ireland, Zimbabwe. A sides, Lions and age-group teams are left out. Edit `LEAGUES` and
  `TEST_NATIONS` in `cricsim/src/cricsim/social/__init__.py` to change it.
- **Slides** (one per block of the match Overview, `carousel.html`): projected scores with the win chance, key duel,
  fall of wickets, players to watch, the ground, fantasy picks with the link.
- **Caption:** teams, win chances, projected scores, key duel, captain pick, link, hashtags for the league.
- **Images** are pushed to the repository's `social` branch (one commit, replaced every time) because Instagram
  fetches them from public URLs.

Try it without posting:

```bash
uv run python -m cricsim.social preview --match <match-id> --out /tmp/carousel    # slides + caption.txt
uv run python -m cricsim.social run --state cricsim/social/posted.json --dry-run   # what is due now
```

## Connect the account (one time)

1. The Instagram account must be a **Business** or **Creator** account, linked to a **Facebook Page**.
2. At developers.facebook.com create an app (type *Business*) and add **Instagram Graph API**.
3. In Meta Business Suite → Settings → **System users**, add a system user, give it the Page and the Instagram
   account, and generate a token for the app with `instagram_basic`, `instagram_content_publish`,
   `pages_show_list` and `pages_read_engagement`. A system-user token doesn't expire (a normal user token lasts
   60 days).
4. Find the Instagram user id: `GET https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account`
   with that token.
5. In GitHub → Settings → Secrets and variables → Actions:
   - secrets `IG_ACCESS_TOKEN` (the token) and `IG_USER_ID` (the Instagram user id);
   - variable `SOCIAL_ENABLED` = `true` (turns posting on; remove it to stop).

The next Auto run picks it up. Each post shows in that run's log as `<match-id>: posted (<media id>)`.
