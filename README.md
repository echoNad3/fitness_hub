# Fitness Hub

A personal, phone-first Workout A / Workout B companion built with React, TypeScript, and Vite. It tracks exercise setup, targets, weights, previous-result guidance, session results, workout history, and a configurable rest timer.

Workout templates can be edited in the app. All data autosaves to browser `localStorage`, with JSON export and import for backups. There is currently no backend, account, or cross-device sync.

## Development

```sh
npm install
npm run dev
npm run test
npm run lint
npm run build
```

The development server runs at `http://localhost:5173` by default. `npm run build` performs strict TypeScript checking before creating the production bundle.

## Deployment

Pushing `main` to GitHub runs `.github/workflows/deploy.yml`, which tests, lints, builds, and deploys the site to GitHub Pages. During GitHub Actions builds, Vite derives the repository subpath from `GITHUB_REPOSITORY`; local development continues to use `/`.
