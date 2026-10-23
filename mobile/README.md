# CricSynthesis for Android

The app is the website's own screens for phones (`app/app/m/`: splash, sign-in, matches, match centre, MatchSynth Lab,
account) inside a [Capacitor](https://capacitorjs.com) shell. Forecasts load from the live site's `/data/`; the Lab
runs its simulations on the phone, as it does in the browser. Nothing new runs on a server.

```
mobile/
├── capacitor.config.json   app id in.cricsynthesis.app, splash, Google sign-in plugin
├── scripts/build-web.mjs   builds app/ (data from the live site) into www/
├── assets/                 icon and splash sources (generated sizes live in android/app/src/main/res)
└── android/                the native project (Gradle)
```

## Build

GitHub Actions builds it (`.github/workflows/android.yml`, on every push that touches `app/` or `mobile/`, or by
hand). The run's artifact holds the APK: download it on the phone, allow installs from that source, and open it.

Locally (needs the Android SDK and JDK 21):

```bash
cd app && npm ci && cd ../mobile && npm ci
node scripts/build-web.mjs          # app screens → www/ (overwrites app/out: rebuild app/ before deploying the site)
npx cap sync android
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

The screens also open in a phone browser at `<site>/m/`, which is the quickest way to try a change.

## One-time setup

1. **Google sign-in.** In the Firebase console (project `cricsynthesis`) add an Android app with package
   `in.cricsynthesis.app` and the SHA-1 of the release key (step 2), and also of the debug key if you test debug builds
   with Google. Download `google-services.json` and save its contents as the repository secret `GOOGLE_SERVICES_JSON`.
   The same file turns on match alerts (Firebase Cloud Messaging) and crash reports (Crashlytics). Without it the app
   is built without those native plugins and offers email sign-in only.
2. **Release key** (needed for the Play Store and for a stable Google sign-in SHA-1). Make it once and keep a backup;
   an app can never change its key once it is on the Play Store:
   ```bash
   keytool -genkeypair -v -keystore cricsynthesis-release.jks -alias cricsynthesis -keyalg RSA -keysize 2048 -validity 10000
   keytool -list -v -keystore cricsynthesis-release.jks -alias cricsynthesis   # SHA-1 for step 1
   base64 -w0 cricsynthesis-release.jks                                        # → secret ANDROID_KEYSTORE_B64
   ```
   Secrets: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`cricsynthesis`),
   `ANDROID_KEY_PASSWORD`. With them every run also makes a signed release APK and an `.aab` for the Play Store.
3. **Match alerts.** Re-run `infra/bootstrap.sh` (it enables the FCM API and lets the deployer send), then set the
   repository variable `ALERTS_ENABLED=true`. The nightly publish then plans alerts against the live site before
   deploying and sends them after (`cricsim/notify.py`): new forecasts, and forecasts re-run with named XIs.
4. **Data.** The site must send `Access-Control-Allow-Origin: *` on `/data/**` (in `firebase.json`); it goes live with
   the next website deploy.

## Notes

- The app's local server answers every path without a file extension with `www/index.html`, so that file only sends
  the app to `/m/index.html` (the splash); every other screen is reached by client-side navigation.
- Android's back button goes back a screen, and closes the app on the match list and sign-in (`components/App.tsx`).
- Links to website pages (terms, privacy, API keys, account deletion) open in the phone's browser.
- Version: `versionName` comes from `mobile/package.json`, `versionCode` from the workflow's run number.
