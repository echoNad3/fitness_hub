# Fitness Hub

A personal, phone-first Workout A / Workout B companion built with React, TypeScript, and Vite. It tracks exercise setup, targets, weights, previous-result guidance, session results, workout history, and a configurable rest timer.

Workout templates can be edited in the app. All data autosaves to browser `localStorage`, with JSON export and import for backups. Optional Supabase email/password sign-in adds offline-first cross-device sync; the app remains fully usable without an account.

## Development

```sh
npm install
npm run dev
npm run test
npm run lint
npm run build
```

The development server runs at `http://localhost:5173` by default. `npm run build` performs strict TypeScript checking before creating the production bundle.

## Android

```sh
npm run android:sync
npm run android:open
```

`android:sync` builds the web app and copies it into the Capacitor Android project. `android:open`
requires Android Studio. GitHub Actions also builds a debug APK and keeps it as a workflow artifact
for 14 days. The native wrapper schedules the rest-complete alert as a local notification so it can
fire while the phone is locked.

## Deployment

Pushing `main` to GitHub runs `.github/workflows/deploy.yml`, which tests, lints, builds, and deploys the site to GitHub Pages. During GitHub Actions builds, Vite derives the repository subpath from `GITHUB_REPOSITORY`; local development continues to use `/`.
