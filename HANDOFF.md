# Fitness Hub — Project Handoff

> **Purpose of this file:** This is the single source of truth for continuing this project in any
> new chat or AI tool. Read it top to bottom before doing anything. It contains the vision,
> the user, the requirements, the hard constraints, the design language, the architecture, what
> is already built, what is left, and the traps to avoid. You should be able to continue the work
> with zero additional context from the user.
>
> **⚠️ MANDATORY (see the last section):** After *any* change, decision, or brainstorm, you MUST
> update this file so it always reflects reality.

---

## 1. The end-goal vision

A **personal, phone-first gym "command panel"** for **one user** that replaces messy Google Keep
workout notes. It runs a fixed **Workout A / Workout B** routine. During a session the user wants
to instantly see and act on: what exercise is next, its setup (seat/bench angle/etc.), target
sets×reps, current weight, what happened last time, whether to go heavier or repeat, and a rest
timer — with the **least possible friction** while tired and mid-set.

It must be: extremely fast to scan on a phone, layout-stable, visually premium, low-tap, usable
while tired, impossible to lose your place, and better than Google Keep in every practical way.

The aesthetic target is a **premium dark native mobile app** (the user's reference was a dark
banking app): soft dark-gray surfaces, rounded premium cards, soft blue accent, soft green for
"done", soft coral/red for "failed", gentle depth — **no harsh neon, no AI-slop card stack, no
generic SaaS-dashboard look, no childish/gamer styling.**

---

## 2. Who the user is (communication guide)

- **Does not code at all** and calls themselves a "noob." The original app was built entirely by
  OpenAI Codex, not by the user. They cannot read or debug code — never assume otherwise.
- **Autistic.** Values clear, predictable, low-ambiguity, structured, honest communication.
  Explicitly asks for the "brutal no-bullshit truth." Define jargon briefly. Prefer concrete
  multiple-choice options over open-ended questions. When unsure, ask rather than guess.
- Thinks **visually** — responds best to mockups/screenshots, not abstract descriptions.
- **GitHub:** username **echoNad3**, repo **`echoNad3/fitness_hub`** (created, `main` pushed).
  Aside: the local git commit author is `zackdresden90 <zackdresden90@gmail.com>` (the user's Claude
  email, *not* necessarily their GitHub email) — cosmetic, can be changed if they care. Do NOT
  assume the GitHub handle from the git author name (that earlier mistake is how `zackdresden90`
  wrongly appeared).
- Works on **Windows 11**, project at `C:\Users\kzaum\Documents\Projects\fitness_hub`.

---

## 3. Product requirements

- Two fixed routines: **Workout A** and **Workout B**.
- Each exercise has: name, **setup note** (e.g. `20°`, `5-top`, `bottom`), target **sets × reps**,
  current **weight** (with a per-hand flag for dumbbells), a **muscle group/category**, and a
  **previous result**.
- The user **does NOT log every set.** They only mark each exercise **Done** or **Failed** at the
  end. Done/Failed must be easy to switch or clear (tap again to clear).
- **Guidance:** if last session was Done → suggest *increase*; if Failed → suggest *repeat*; if
  none → neutral. Shown as a plain sentence, e.g. *"Last session: Failed — repeat the same weight
  today."* The previous result must be **editable repeatedly** (e.g. to fix a set you forgot to tap).
- Weight changed **manually** via −/+ (1.25 steps) or manual edit. App carries the weight forward
  from the last session.
- **Rest timer** (default **90s**, was 10s for testing — now a setting).
- **Everything autosaves** to **localStorage** first. Optional Supabase sign-in syncs that local
  cache across devices; the app remains fully usable without an account or network.
- **Edit everything in-app, never return to code:** exercise name, setup, sets, reps, weight,
  muscle group, per-hand, the *previous result*, the *lineup* (add / remove / reorder / replace
  exercises), and settings (rest length). All done; see §7.
- Auto-alternate: the main screen tracks the last workout and suggests the *other* one for "Start".

---

## 4. Hard UX constraints (DO NOT VIOLATE)

- The exercise list is a **fixed-order list** where the active exercise **expands in place**.
- **No** separate "command panel at top + queue" layout. **No** pulling the current exercise out
  of the list. The visual order must stay stable.
- (Historical note: the repo used to ship an `impeccable` design skill whose saved critique
  recommended the OPPOSITE — a dominant top command-panel + low-noise queue. That was **rejected**
  and the tool was **deleted**. Do not reintroduce that pattern. Honor the user's in-place list.)

---

## 5. Design language

CSS variables live in `src/App.css :root`. Use them; don't hardcode.

**Core UI tokens**
- Background `--bg #252730`, surfaces `--surface #30323d`, `--surface-2 #363844`,
  `--surface-3 #414351`, `--raised #494b59`.
- Text `--text #f4f5f8`, `--muted #aab2c0`, `--quiet #8b93a0`.
- Hairline `--line rgba(255,255,255,0.065)`.
- **Accent (soft blue) `--accent #6074f3`** — primary actions / interactive bits only.
- **Done/success `--success #51cf7b`** (soft green).
- **Failed/danger `--danger #f2767d`** (soft coral).
- **Warning `--warning #f4cb59`** (amber) — used for "partial" history chips.
- Focus `--focus #d9e0ef`; accent tint/line `--accent-soft` / `--accent-line`; shared page glow
  `--page-glow rgba(96,116,243,0.08)`.
- Corners: `--radius 16px`, `--radius-card 14px`, `--radius-control 11px` (deliberately *slightly*
  less rounded — "not a kids playground"). Shared depth: `--shadow` for dialogs and
  `--soft-shadow` for raised cards/docks. Do not add accent-colored glow shadows.

**Muscle-group colors** ("metallic" theme — user-chosen). Defined in `muscleColors` in
`src/App.tsx`. Shown as a subtle row outline (~32% alpha, hex suffix `52`), a dot, and the colored
category word; in the editor as selectable chips.
| Muscle | Color |
|---|---|
| Chest | `#d6b252` gold |
| Back | `#b9c2cb` silver |
| Shoulders | `#a37f50` bronze |
| Biceps | `#aa9fc9` purplish-silver |
| Triceps | `#d98c4e` warm orange |
| Core / Abs | `#e48fbf` pink |
| Legs | `#e48fbf` pink (same as core — user's call) |

**Rule:** muscle colors must stay visually distinct from the reserved UI colors (accent blue,
success green, danger coral, warning amber). If adding/retheming a muscle, keep this rule.

---

## 6. Tech stack & architecture

- **Vite 8 + React 19 + TypeScript**, plain CSS. Data in **localStorage**. Lint: `oxlint`.
  PWA generation uses `vite-plugin-pwa` + Workbox; install icons come from the deterministic
  `public/app-icon.svg` via `@vite-pwa/assets-generator`.
- **Capacitor 8 + Android** for the native wrapper. A **custom `RestAlarm` plugin** schedules an
  exact AlarmManager alarm that fires a strong ~6s vibration (RestVibrationReceiver) when the rest
  timer ends — felt while locked. (Earlier used Local Notifications, but a notification only gives a
  brief light buzz; the user needs a heavy multi-second vibration, hence the native alarm.)
  Node 24. This stack is correct for a one-user phone app — do **not** rewrite it in something else.
- **Single-component app.** Almost everything is in `src/App.tsx` (one big `App()` component with
  render helpers + module-level helpers). State is one `data: AppData` object + a `screen` object,
  both persisted to localStorage on every change via `useEffect`.

**File map** (everything else is config/build):
| File | Role |
|---|---|
| `src/App.tsx` | The entire app: types, default workout data, `App()` component, all screens, all logic, dialogs, the `Icon` component (inline SVGs), data builders/migration. |
| `src/App.css` | `:root` tokens, base button/heading styles, `.empty-state`, and **dialog** styles only. |
| `src/workout.css` | The workout/session screen (`.ws-*`). |
| `src/home.css` | The home hub (`.home-*`). |
| `src/chrome.css` | Shared page chrome + History + Settings (`.page-*`, `.hist-*`, `.set-*`). |
| `src/edit.css` | Edit mode + exercise editor (`.ws-edit-*`, `.ws-add`, `.ex-*`). |
| `src/cloud.ts` / `src/cloudConfig.ts` | Supabase client + connection config (URL + publishable key) for cloud sync. |
| `src/cloudSync.ts` | Pure timestamp/conflict helpers for deciding pull vs push and protecting existing local data during the sync migration. |
| `src/restNotifications.ts` / `src/restAlarm.ts` | Schedule/cancel the native locked-screen rest **vibration** via the custom `RestAlarm` plugin; no-op on web. |
| `android/.../RestAlarmPlugin.java` + `RestVibrationReceiver.java` | Native exact-alarm + ~6s heavy vibration waveform for the locked-screen rest alert. |
| `src/index.css` | Global resets, base dark background, font. |
| `src/domain.ts` | Pure, tested workout operations: result toggling, reordering, auto-advance, rest clamping, active-variant selection. |
| `src/dataValidation.ts` | Deep validation for imported backups, templates, sessions, and legacy variant overrides. |
| `tests/*.test.ts` | Node-native unit tests for domain behavior and backup/data validation (no extra test dependency). |
| `.github/workflows/deploy.yml` | GitHub Pages pipeline: install, test, lint, build, upload artifact, deploy. |
| `.github/workflows/android.yml` | Android CI: test, Capacitor sync, compile a debug APK, upload it as an artifact. |
| `capacitor.config.ts` / `android/` | Capacitor app identity/config plus the generated and customized Android Studio project. |
| `scripts/generate-android-assets.mjs` / `resources/` | Rebuild branded Android launcher icons and splash screens from the Fitness Hub SVG sources. |
| `vite.config.ts` | Vite base path plus PWA manifest and Workbox precache configuration. |
| `pwa-assets.config.ts` | Deterministic generation settings for Android, Windows, and Apple install icons. |
| `public/app-icon.svg` + generated icon files | Fitness Hub favicon, home-screen, Apple touch, and maskable install assets. |
| `index.html` | Page shell. |
| `.claude/launch.json` | Dev-server config for the preview tooling (`npm run dev`, port 5173). |

**Data model** (`AppData` in `src/App.tsx`):
- `sessions: WorkoutSession[]` — each saved session; stores per-exercise `weight/setup/sets/reps/result`.
- `templates: WorkoutTemplate[]` — **the editable A/B routines** (seeded from `defaultWorkouts`,
  the formerly-hardcoded data). This is what the in-app editor mutates.
- `variantPrefs` — which variant is active per swap-group.
- `baselineResults` — the "previous result" seed for the very first session of an exercise.
- `expandedBySession`, `scrollBySession`, `currentSessionByWorkout` — UI/session bookkeeping.
- `restSeconds: number` — rest timer length (default `DEFAULT_REST_SECONDS = 90`).

**Key architectural notes / gotchas:**
- `getWorkout(workoutId)` reads a **module-level `let templatesRef`** that is reassigned at the top
  of `App()` to `data.templates` every render. This avoids threading `data` through ~15 call sites.
  It's a deliberate pragmatic pattern; keep it in sync if you refactor.
- Editing a template **retroactively** changes how past sessions render (sessions map over the
  *current* template groups). Acceptable for a personal app; be aware.
- `normalizeData` / `normalizeTemplates` migrate old saved data: missing `templates` are seeded
  from the default and any legacy `variantOverrides` are folded in. localStorage keys:
  `fitness-hub-v1` (data), `fitness-hub-v1-screen` (current screen), and
  `fitness-hub-v1-updated-at` (last local/cloud change used for conflict resolution).
- Imported JSON must pass `isValidBackup` before it can replace local data. Invalid or structurally
  incomplete templates/sessions are rejected rather than trusted through a TypeScript cast.
- TypeScript is strict (`noUnusedLocals`): unused functions/locals **fail the build**. Remove dead
  code as you go.
- Screens: `main` (home hub), `global-history`, `settings`, `session`. (The old `workouts` /
  `workout-menu` / `workout-history` screens were removed in Phase 2.)
- Icons are inline SVGs via the `Icon` component (`name` switch). No icon library.
- **Build base path (important):** GitHub Pages needs `base: '/fitness_hub/'`, but Capacitor needs
  root `'/'` — it serves from the webview root, so a subpath makes every asset 404 → **blank APK**.
  `vite.config.ts` switches on `CAPACITOR_BUILD=true` (root) vs GitHub Actions (Pages subpath); the
  `android:sync` script sets `CAPACITOR_BUILD` via `cross-env`. Pages deploy (`npm run build`) keeps
  the subpath. Never let the Android build use the subpath.
- **Android distribution + auto-update:** `capacitor.config.ts` sets `server.url` to the live Pages
  site, so the installed APK loads the live app and **auto-updates with every web deploy** — rebuild
  the APK only for *native* changes (config/plugins/icons). `android.yml` also publishes each APK to
  a GitHub Release; the stable link
  `https://github.com/echoNad3/fitness_hub/releases/latest/download/app-debug.apk` is surfaced in
  Settings as "Get the Android app" (hidden when running inside the native app). Native offline now
  relies on the cached service worker after the first online launch.
- Cloud sync is **offline-first and last-write-wins**: sign-in compares local and remote
  `updated_at`; newer validated remote data is pulled, otherwise local data is upserted. Later
  local changes debounce for 900ms before upload. Remote data must pass `isValidBackup` before it
  can replace the local cache. Sign-out never deletes local data. Offline edits advance the local
  timestamp and upload on the next change or on reconnect (a `window` `online` listener re-runs the
  sync), so single-device offline work is **preserved, not overwritten**. The only loss case is
  editing the *same account on a second device* that synced more recently — that's true
  last-write-wins by timestamp.
- Rest countdown state is wall-clock based (`restEndsAt`), not interval-count based. This prevents
  a suspended/locked app from resuming with a stale countdown. The locked-screen alert is a **native
  heavy vibration**, NOT a notification: `RestAlarmPlugin` (Java) schedules an exact alarm
  (`USE_EXACT_ALARM`, `setExactAndAllowWhileIdle`) → `RestVibrationReceiver` plays a ~6s strong
  waveform via Vibrator/VibratorManager (manifest also needs `VIBRATE` + `WAKE_LOCK`).
  `src/restNotifications.ts` calls it through the `RestAlarm` plugin (`src/restAlarm.ts`); no-op on
  web. Changing the vibration needs a native APK rebuild, not just a web deploy.

---

## 7. What is currently implemented (DONE)

Git history (newest first); each commit is a clean restore point:
- `16db4be` Complete local PWA verification
- `8a4ca64` Checkpoint PWA app shell and install assets
- `1320ae2` Update handoff after cloud sync recovery polish
- `30cab0f` Cloud sync step 4: add recovery controls
- `7aa17b1` Record successful cross-device cloud sync test
- `bebfa42` Update handoff after cloud sync deployment
- `27ab282` Record authenticated cloud upload verification
- `eba9acf` Cloud sync step 3: pull, debounced push, and status
- `1a078c2` Cloud sync step 2: Supabase client + optional sign-in in Settings
- `c3f87a7` Plan cloud sync + login (Supabase) in the handoff
- `47ef9f9` Update handoff: app is live on GitHub Pages
- `021e0fd` Update handoff: GitHub repo `echoNad3/fitness_hub` created and pushed
- `6044101` Prepare automated GitHub Pages deployment
- `d271149` Release-candidate hardening and consistency polish
- `940de51` Phase 3c: editable rest length setting (default 90s)
- `ef6d80b` Phase 3b: edit mode with reorder, remove, add, and exercise editor
- `9711846` Phase 3a: make workouts editable data (templates in localStorage)
- `eb7c4db` Phase 2b: restyle History + Settings, slim App.css
- `98d730a` Phase 2: replace nested menus with a single home hub
- `27d87a0` Set muscle palette to gold/silver/bronze metallic theme
- `05b13b9` Phase 1 cleanup: remove dead CSS, unused assets, impeccable tooling
- `fe8caf6` Phase 1: redesign workout session screen
- `5adba7c` Snapshot: original app before redesign (full restore point)

**Feature status:**
- **Workout/session screen** — fixed-order list, active exercise expands in place, muscle colors
  (outline + dot + category word), guidance sentence (green increase / coral repeat), Setup/Target
  tiles (tap to edit), big weight stepper (−1.25/+1.25, tap value to edit), big Done/Failed
  (tap-again clears, auto-advances to next pending), progress rail, full-width rest dock.
- **Home hub** (`main`) — title, **Resume** card (only for an unfinished latest session, shows
  progress + relative time), **Start** (auto-suggests the opposite of the last workout, with a
  "Start X instead" alternate), and **History** / **Settings** tiles. No browser confirms.
- **History** — clean cards, relative time, semantic done/partial chip, trash delete.
- **Settings** — Export/Import JSON backup, Test vibration, **Rest length stepper**, Reset.
- **Full editing** — in-session field edits persist to the routine; **edit mode** (pencil in the
  session header) for reorder (up/down) / remove / add; a full **exercise editor** dialog
  (name, muscle group chips, sets, reps, setup, weight, per-hand) for add & edit.
- **Release hardening** — edit mode now edits the variant active in that session, full-editor
  setup/target/weight changes stay in sync with the open session, the final exercise cannot be
  removed, backup imports are deeply validated, and React hook lint warnings are resolved.
- **Automated safety net** — `npm test` runs fifteen Node-native unit tests covering result toggles,
  ordering, auto-advance, rest bounds, active-variant selection, legacy migration acceptance,
  template/session validation, timestamp parsing, first-sync direction, migration safety, and
  strictly monotonic local sync timestamps, and wall-clock rest countdown calculations.
- **Consistency polish** — home accent glow was removed, shared glow/depth/radius/focus tokens now
  drive every screen, dialogs reserve filled blue for the primary action, and compact icon targets
  are 42px. Phone audit covered home, workout, history, settings, edit mode, and the editor dialog.
- **Safety net** — real git repo (the original `.git` was empty/broken). "Undo everything" = ask
  to restore commit `5adba7c`.
- Removed: the `impeccable` design tool (`.agents`, `.impeccable`, `.codex/hooks.json`), ~600+
  lines of dead CSS, unused images. Project went 122 → ~20 tracked files.
- **LIVE** — deployed to GitHub Pages at **https://echonad3.github.io/fitness_hub/** via the
  Actions workflow; auto-deploys on every push to `main`.
- **Cloud sync step 3** — on sign-in the app pulls newer validated cloud data or pushes the local
  cache; later changes debounce-upsert the whole `AppData` row. Settings shows Checking, Syncing,
  Synced, or a safe error state. Existing local installs receive a one-time migration timestamp;
  fresh devices do not overwrite an existing cloud row with defaults.
- **Cloud sync step 4a** — a paused sync now exposes an explicit **Retry** action, cloud errors are
  separated from the short status label, sign-out shows a busy state and reports failures instead
  of silently ignoring them, and local change timestamps always advance even when multiple changes
  happen within one millisecond.
- **PWA** — installable manifest, dark Fitness Hub install icon set, standalone/portrait app mode,
  GitHub Pages-safe scope/start paths, and a Workbox service worker that precaches the full app shell.
  The service worker uses `registerType: 'autoUpdate'`, so a new deploy applies automatically on the
  next load (no manual close needed). Expected, not a bug: a previously-cached client can still serve
  the old version for a single load while the new SW activates in the background — reopen once.
- **Native Android step 1** — Capacitor 8 wrapper, synced Local Notifications plugin, exact-alarm
  permission, branded launcher/splash/status icons, native permission/error fallback messaging, and
  a CI workflow that builds a downloadable debug APK. Local Android compilation is unavailable
  because this Windows machine has no Java or Android SDK; GitHub Actions compilation is pending.
  **Bug found + fixed during review: the APK was building with the GitHub Pages subpath base
  (`/fitness_hub/`), which would have launched to a blank screen inside the Capacitor webview. The
  Android build now forces root base (`CAPACITOR_BUILD`). Re-build the APK from the latest `main`.**

The release/UI phases were verified live (build, lint, tests, browser DOM checks, console checks,
and 390×844 browser-preview screenshots). Cloud sync steps 3 and 4a pass build, lint, and unit tests.
Its authenticated upload path was verified locally with a reversible 90s → 105s → 90s change:
both writes reached `Synced` with no console errors. Cross-device pull was then verified on the
live phone app using a temporary 105s marker; the cloud value was restored to 90s afterward.

---

## 8. What is left (the plan ahead)

**✅ Phase 4: Hosting — DONE.** The app is **LIVE at https://echonad3.github.io/fitness_hub/**
(verified HTTP 200; assets served correctly under `/fitness_hub/`). Repo `echoNad3/fitness_hub`,
Pages **Source = GitHub Actions**, auto-deploys on every push to `main` via
`.github/workflows/deploy.yml` (runs tests → lint → build → deploy). To ship a change: commit to
`main` and `git push` — that's the whole release process now.

**NEXT (deferred features, in priority order):**

1. **PWA — DONE and LIVE.** Production tests, lint, and build pass; the manifest
   has the correct `/fitness_hub/` scope/start URL and Workbox precaches 12 entries. Offline behavior
   was proven on 2026-06-28 by loading the production preview, confirming the server was down, then
   reloading the full Fitness Hub home screen from cache with no console warnings/errors. Pages
   workflow run `28315746883` succeeded; the live homepage, manifest, service worker, and PNG install
   icon all returned HTTP 200, the manifest exposes four icons, and the deployed worker contains the
   precache route.
2. **Native wrap (Capacitor) — IN PROGRESS, current focus.** Android project and notification logic
   are implemented and `cap sync android` passes. Starting a rest timer schedules an exact local
   notification with `allowWhileIdle`; canceling rest cancels it; permission denial is shown without
   breaking the visible timer. The timer itself now derives from its end timestamp, so it catches up
   correctly after suspension. Web regression check passed at 15s with no console errors.
   **NEXT:** push and verify `.github/workflows/android.yml` compiles the debug APK, then install that
   APK on the user's Android phone and run the decisive locked-screen notification test. The local
   machine has no Java/Android SDK/adb, so device installation cannot be completed here.
3. **Cloud sync + login (COMPLETE).** Approach: **Supabase** (free tier, works
   from a static site; the Project URL + anon key are public-safe, protected by Row Level Security).
   Simple **email/password** auth, and **optional** — the app still works fully offline without
   login; signing in just enables cross-device sync. localStorage stays the local cache (offline-first).
   - **Data model:** one row per user in `public.app_state` — `user_id uuid pk → auth.users`,
     `data jsonb`, `updated_at timestamptz`. RLS restricts each row to its owner (own-row
     select/insert/update policies). Sync = the whole `AppData` blob, **last-write-wins** by
     `updated_at` (fine for one user): on login pull remote if newer; on change debounce-upsert.
   - **Incremental steps (each its own commit, so usage limits don't lose progress):**
     **(1)** user creates a Supabase project, runs the table+RLS SQL, and provides Project URL +
     anon key. **(2)** add `@supabase/supabase-js`, a `src/cloud.ts` client, and a sign-in entry in
     Settings (login UI). **(3)** wire pull-on-login + debounced push-on-change + a "synced" status.
     **(4)** polish: errors, sign-out, conflict edge cases.
   - **Config:** Supabase URL + **publishable** key (`sb_publishable_…`, the modern browser-safe
     key — note Supabase replaced the old `anon` JWT) live in `src/cloudConfig.ts` (committed;
     public-safe with RLS). Project: `jrsowjbxenkrmzzknnab.supabase.co`.
   - **STATUS: Steps 1, 2 & 3 IMPLEMENTED.** Backend is live (`app_state` table + RLS verified via REST).
     `@supabase/supabase-js` added; `src/cloud.ts` exposes the client; Settings has an optional
     email/password auth UI (sign-in/sign-up dialog) — verified that sign-in round-trips to Supabase
     ("Invalid login credentials" returned for a bogus account). Step 3 now implements pull-newer,
     debounced push, validation, migration safety, and visible sync status. Real-account upload was
     verified locally on 2026-06-27. Commit `27ab282` then deployed successfully through Pages
     workflow run `28300067832`, and the live URL returned HTTP 200. A phone signed into the same
     account successfully pulled the 105s test marker; the value was then restored and synced at
     90s. **Step 4a is deployed in `30cab0f` + `1320ae2`**: paused-sync retry UX, clearer
     sign-out/error handling, and monotonic timestamp conflict hardening. Tests, lint, build, and a
     390×844 Settings audit pass. Pages workflow run `28300808013` succeeded and the live URL
     returned HTTP 200. The real-phone recovery test was confirmed on 2026-06-27: changing data
     offline showed **Sync paused** + **Retry**, restoring the network and retrying returned to
     **Synced**. Cloud sync is complete; only fix new issues if continued use exposes one.
   - **NOTE:** the user may need to disable "Confirm email" in Supabase Auth settings for instant
     login; otherwise sign-up requires email confirmation before the first sign-in works.

4. **Selectable workout splits (FUTURE IDEA — not built yet).** Today the only split is the fixed
   two-workout rotation (Workout A / Workout B). The longer-term goal is to let the end user pick a
   **split type** (e.g. **Push / Pull / Legs**, upper/lower, full-body, custom) — chosen once in
   **Settings** — so the app is usable by the public, not just one person. Design rules to preserve
   when this is built:
   - The main menu already reads from a generic rotation: "up next" is "the workout after your last
     session" in whatever ordered list the active split defines, and the **Start new workout** prompt
     lists every *other* workout in that split under "Or pick another". Adding PPL is mostly a matter
     of letting the split define more than two workouts — the menu UI does not need to change.
   - **Never mix splits.** A/B sessions and PPL sessions must not appear in the same rotation; the
     active split owns the whole list. Switching split type in Settings swaps the rotation wholesale.
   - History, the 14-day tracker, and resume all key off sessions generically, so they already work
     for any number of workouts per split.

---

## 9. How to run, build, and verify

```sh
npm install        # if node_modules missing
npm run dev        # Vite dev server on http://localhost:5173
npm test           # Node-native domain + backup-validation tests
npm run build      # tsc -b && vite build  — MUST pass before committing
npm run lint       # oxlint
```

- **Always run `npm run build` before committing** — it type-checks (strict) and bundles. A green
  build + a visual check is the bar.
- To see a specific screen during dev, you can seed/route via the browser console using the
  localStorage keys in §6 (e.g. set `fitness-hub-v1-screen` to `{"name":"session",...}` and reload),
  but prefer driving the real UI (Start a workout, tap around).
- Commit style: end commit messages with a `Co-Authored-By:` line. Each meaningful step = one
  commit (a restore point the non-coding user can roll back to by asking).

---

## 10. Working agreement / how to behave on this project

- Build in **small, verified, committed chunks**; show the user **screenshots/mockups** for visual
  decisions before/after building. They can't read code.
- Be honest and direct. Recommend a default; don't dump exhaustive option lists.
- Respect the hard constraints in §4 absolutely.
- Keep the codebase tidy (remove dead code; strict TS will flag it anyway).

---

## ⚠️ 11. MANDATORY: keep this file updated

**This is not optional.** After *any* change to the code, any new decision, any brainstorm, any
completed phase, or any change of plan, you MUST update `HANDOFF.md` in the same session so it
always reflects the current truth — update §7 (what's done), §8 (what's left), the git history,
the design tokens, and anything else affected. Treat this file as part of the deliverable. A future
AI (or the user) should always be able to open *only this file* and know exactly where things stand
and what to do next. If you finish work without updating it, the work is not finished.
