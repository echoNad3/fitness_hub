# Fitness Hub

Run your workout without managing a spreadsheet, note, or complicated fitness app.

[Open Fitness Hub](https://echonad3.github.io/fitness_hub/) · [Download the Android APK](https://github.com/echoNad3/fitness_hub/releases/latest)

Fitness Hub is a phone-first workout runner. It shows the exercise, setup, target, weight, previous
result, and rest timer in one place. The default routine is Workout A / Workout B, and every exercise
can be changed inside the app.

## What it does

- Keeps the active exercise open in the workout list, so your place never moves.
- Marks each exercise Done or Failed, then opens the next unfinished exercise.
- Carries weights forward and tells you whether to increase or repeat.
- Runs a per-exercise rest timer. The Android app can vibrate while the phone is locked.
- Saves locally first and works offline. No account is required.
- Optionally syncs across devices with Supabase.
- Exports and imports a JSON backup.

## Use it

1. Open the app and tap **Start workout**.
2. Follow the exercise cards. Change the weight if needed, then tap **Done** or **Failed**.
3. Leave when the workout is complete. Everything is already saved.

Edit mode changes exercise names, setup notes, targets, weights, rest times, order, visibility, and
swap pairs. History shows completion, frequency, and workout duration.

## Your data

Workout data stays in browser storage unless you sign in. Signed-in data is stored in one private
Supabase row per account and protected by Row Level Security. Download a backup from Settings before
clearing browser or app data.

## Android

The installed Android app adds locked-screen rest alerts, native haptics, and an in-app APK updater.
Web-interface updates activate in the background and are used on the next app load; they do not
reload an open workout. Native Android changes still require a new APK.

The current GitHub workflow publishes a debug APK for sideloaded testing. It needs private release
signing before the APK is treated as a public production release. Each release also includes short
notes and a SHA-256 checksum so the downloaded APK can be verified.

## Run locally

Requires Node.js 24.

```sh
npm install
npm run dev
npm test
npm run test:e2e
npm run lint
npm run build
```

The development server runs at `http://localhost:5173`. Offline mode works without setup. The
included cloud config points to the live Fitness Hub backend; use your own Supabase project before
publishing a fork with account sync.

For Android development:

```sh
npm run android:sync
npm run android:open
```

## Project map

- `src/App.tsx` — app state, screens, and interactions.
- `src/WorkoutEditorList.tsx` — the lazy-loaded workout editor.
- `src/*.ts` — tested domain, sync, validation, storage, timer, and update logic.
- `src/*.css` — the shared design system and screen styles.
- `android/` — the Capacitor app and native Android plugins.
- `tests/` — unit and phone-layout browser tests.
- `HANDOFF.md` — product rules, architecture, decisions, and current status.
