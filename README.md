# Fitness Hub

A phone-first gym companion for a fixed Workout A / Workout B rotation. One screen runs the whole
session: exercise setup, target sets × reps, current weight, guidance from last time, Done/Failed
marking with auto-advance, and a per-exercise rest timer that vibrates through a locked screen on
Android.

Live app: **https://echonad3.github.io/fitness_hub/** (installable PWA; Android APK on the
[latest release](https://github.com/echoNad3/fitness_hub/releases/latest)).

## Features

- Editable workouts: exercises, muscle groups, targets, setup notes, per-exercise rest, notes,
  drag-to-reorder, and swap pairs (two exercises sharing one slot).
- Result-driven guidance: finish an exercise and the next session asks how much weight to add.
- History with a 28-day tracker, completion stats, and per-session duration.
- Offline-first: everything autosaves to `localStorage`; JSON export/import for backups.
- Optional account (Supabase email/password) for cross-device sync — the app is fully usable
  without one.
- Gym pass: store your gym's entry QR code and show it from the home screen.
- Native Android wrapper (Capacitor) with an exact-alarm rest vibration and semantic haptics.

## Development

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # Node-native unit tests
npm run lint    # oxlint
npm run build   # strict type-check + production bundle
```

## Android

```sh
npm run android:sync   # build the web app and sync it into the Capacitor project
npm run android:open   # open in Android Studio
```

CI builds a debug APK on every push and publishes it to a GitHub release. The installed app loads
the live site, so web changes reach it without reinstalling; only native changes need a new APK.

## Repository notes

- `src/App.tsx` holds the whole app by design (types, data, screens, dialogs); pure logic lives in
  small modules (`domain.ts`, `cloudSync.ts`, `dataValidation.ts`) covered by the tests.
- `HANDOFF.md` is the project's source of truth: vision, constraints, design tokens, architecture,
  and current status.
- `.github/workflows/`: Pages deploy, Android APK build, and a twice-weekly Supabase keep-alive
  ping (free-tier projects pause after 7 idle days).
