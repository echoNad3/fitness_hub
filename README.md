# Fitness Hub

**A fast, phone-first gym companion that runs your whole workout from one screen.**

Fitness Hub replaces messy notes-app workout logs with a single, glanceable panel built for use
while you're tired and mid-set. It shows the next exercise, how to set it up, your target reps, the
weight you lifted last time, whether to go heavier, and a rest timer — with as few taps as possible.

### ▶ Try it now: **[echonad3.github.io/fitness_hub](https://echonad3.github.io/fitness_hub/)**

Runs in any browser, installs to your home screen like a real app, and works offline. On Android
there's also a [native app](https://github.com/echoNad3/fitness_hub/releases/latest) whose rest
timer buzzes even through a locked screen.

---

## What it does

- **One screen per session.** Setup notes, target sets × reps, current weight, and last time's
  result are all in front of you. Mark each exercise **Done** or **Failed** and it advances to the
  next one automatically.
- **Tells you when to push.** Did well last time? The next session asks how much weight to add, so
  progression is a decision you make on purpose, not one you forget.
- **Your routine, your rules.** Edit every exercise in the app — names, muscle groups, targets, rest
  length, notes, order, and swap pairs (two exercises that share one slot). No code, ever.
- **Progress you can see.** History with a 28-day activity grid, completion rate, weekly average,
  and how long each workout took.
- **Never lose your data.** Everything saves on your phone automatically and works with no account
  and no internet. Sign in (optional) to sync across devices. Export a backup file anytime.

The best way to understand it is to open the live link above and tap around — no sign-up needed.

## Built with

React 19 · TypeScript · Vite · plain CSS · Supabase (optional sync) · Capacitor (Android) — a
deliberately small, dependency-light stack for a fast personal app.

## Run it locally

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run lint    # oxlint
npm run build   # strict type-check + production build
```

## Android

```sh
npm run android:sync   # build the web app and sync it into the Capacitor project
npm run android:open   # open in Android Studio
```

GitHub Actions builds a debug APK on every push and publishes it to a
[release](https://github.com/echoNad3/fitness_hub/releases/latest). The installed app loads the live
site, so web updates arrive automatically; only native changes need a fresh APK.
The app checks for a new web bundle whenever it opens, returns to the foreground, reconnects, and
periodically while visible, then activates and reloads the new UI automatically.

## Project layout

- `src/App.tsx` — the app itself (screens, dialogs, state). Kept in one file on purpose for a
  single-screen app; the pure logic lives in small, tested modules (`domain.ts`, `cloudSync.ts`,
  `dataValidation.ts`).
- `src/*.css` — one stylesheet per screen, driven by shared design tokens in `App.css`.
- `android/` — the Capacitor Android wrapper and native rest-alarm / haptics plugins.
- `.github/workflows/` — GitHub Pages deploy, Android APK build, and a keep-alive ping.
- `HANDOFF.md` — the full project brief: vision, constraints, design system, and architecture.
