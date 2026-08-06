# Fitness Hub

A phone-first workout tracker with editable 1–7 day programs.

[Open the app](https://echonad3.github.io/fitness_hub/) · [Download the Android debug APK](https://github.com/echoNad3/fitness_hub/releases/latest)

- Builds separate programs with Workout A through Workout G.
- Records each exercise as Done or Failed and carries its weight forward.
- Keeps targets, setup notes, and rest time editable per workout.
- Shows filtered workout stats and per-exercise weight or estimated 1RM progress.
- Keeps past workouts fixed even after a program is edited or deleted.
- Saves locally, works offline, and supports optional private sync.
- Imports, exports, and restores protected backup copies.

Ending a workout early records only exercises that were marked Done or Failed. Untouched exercises
are not counted as attempts.

## Data safety

Workout data stays on the device unless account sync is enabled. Destructive changes save a
protected recovery copy first. Automatic copies rotate; protected copies stay until deleted.

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
