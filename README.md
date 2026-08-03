# Fitness Hub

A phone-first workout tracker for a simple A/B routine.

[Open the app](https://echonad3.github.io/fitness_hub/) · [Download the Android debug APK](https://github.com/echoNad3/fitness_hub/releases/latest)

## What it does

- Runs the current workout from one fixed, expanding list.
- Records each exercise as Done or Failed.
- Carries weights forward and shows the last result.
- Keeps an exercise-specific rest timer.
- Shows History, weekly stats, and per-exercise progress.
- Saves to the device first and works offline.
- Supports optional private Supabase sync.
- Exports and imports JSON backups.
- Keeps manual and before-change recovery copies until they are deleted.

Ending a workout early records only exercises that were marked Done or Failed. Untouched exercises
are not counted as attempts.

## Data

Workout data stays in local storage unless account sync is enabled. Import, reset, restore, cloud
replacement, workout edits, and workout deletion save a protected recovery copy first. Automatic
copies rotate; protected copies do not.

JSON backups are plain files. Store them somewhere you trust.

## Development

Requires Node.js 24.

```sh
npm install
npm run dev
npm test
npm run test:e2e
npm run lint
npm run build
```

Useful maintenance commands:

```sh
npm run theme:sync
npm run brand:sync
npm run security:rls
npm run android:sync
```

Edit app colors in `src/theme.css`. Edit the logo only in `brand/fitness-hub-logo.svg`. Generated
files are checked during tests and builds.

The Android download is a sideloaded debug build. Native Android changes require a new APK; web UI
changes deploy through GitHub Pages.
