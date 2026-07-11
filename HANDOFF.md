# Fitness Hub — Project Handoff

> The single source of truth for continuing this project in any new chat or AI tool: vision, user,
> requirements, hard constraints, design language, architecture, status, and traps. Read it before
> doing anything.
>
> **Mandatory:** update this file after any change or decision (see §11).

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

CSS variables live in `src/App.css :root`. Use them; don't hardcode. **Every font size and weight
must use a token below — no one-off `rem`/numeric values.** Root font-size stays at the browser
default (16px); all sizing is expressed through the scale so proportions stay intentional.

**Type scale** (the only font sizes in the app):
| Token | Size | Use |
|---|---|---|
| `--fs-display` | 26px | App title, screen titles |
| `--fs-title` | 22px | Primary buttons (Resume / Start), the weight value |
| `--fs-heading` | 19px | Card / exercise names |
| `--fs-body` | 17px | Default body, row labels, button text |
| `--fs-label` | 15px | Subtitles, secondary text |
| `--fs-meta` | 13px | Meta info, captions |
| `--fs-caption` | 11px | Eyebrows, tiny tags, numerals (uppercase labels) |

**Weights** — three only: `--fw-medium 600`, `--fw-semibold 700`, `--fw-bold 800`.

**Spacing** — `--space-1..6` = 4/8/12/16/24… px. Cards and rows pad with **16px** (`--space-4`),
list gaps are **12px** (`--space-3`). Interactive rows/controls target **`--tap` (48px)** min height.
The workout screen **scrolls when its content genuinely exceeds the viewport** — exercise rows stay
roomy; don't compress them to fit. A natural overrun of up to 64px is treated as layout slack and
clipped so a fully visible default Workout A/B does not have a pointless small bounce.

**Motion** — shared keyframes in `App.css` (`fade-in`, `rise-in`, `pop-in`). All transitions sit in
~100–250ms with no scale overshoot/bounce. **Navigation between menu pages is instant** (no screen
entrance animation). Motion is reserved for explaining change: dialogs `pop-in` (160ms); the
exercise item **genuinely grows** open/closed via `grid-template-rows: 0fr→1fr` on `.ws-item-body`
(the collapsed row and expanded card are one morphing `.ws-item`, not a swap); progress-rail dots
and result chips animate; Done/Failed smooth-scrolls the next exercise in. Press feedback is one
rule: large surfaces `scale(0.98)`, small controls `scale(0.95)`, 120ms. A global
`prefers-reduced-motion` rule neutralizes all of it — never rely on animation for meaning, and reuse
these keyframes rather than adding one-offs. **Cold-start:** `index.html` paints `#252730` and a
spinner (`#app-boot`, removed when React mounts), and the Android launch theme (`styles.xml`) forces
a dark window + system bars, so a fresh APK launch fades from the app's background instead of
flashing black with grey bars. **Reorder** in edit mode is drag-and-drop (`@dnd-kit`, grip handle).

**Core UI tokens**
- Background `--bg #252730`, surfaces `--surface #30323d`, `--surface-2 #363844`,
  `--surface-3 #414351`, `--raised #494b59`.
- Text `--text #f4f5f8`, `--muted #aab2c0`, `--quiet #8b93a0`.
- Hairline `--line rgba(255,255,255,0.065)`.
- **Accent (soft blue) `--accent #6074f3`** — filled primary actions, borders, and tints.
  Foreground accent text/icons on dark gray surfaces use **`--accent-text #91a0ff`** so small labels
  and thin glyphs meet contrast requirements without making filled actions louder.
- **Done/success `--success #51cf7b`** (soft green).
- **Failed/danger `--danger #f2767d`** (soft coral).
- **Warning `--warning #f4cb59`** (amber) — reserved; available for cautions. (History now uses
  **green = finished / red = unfinished** per session, not an amber "partial" state.)
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
  alarm-clock-grade exact AlarmManager alarm three seconds before the timer ends;
  `RestVibrationReceiver` then plays four equal 800ms maximum-amplitude pulses at 3, 2, 1, and 0
  seconds remaining — felt while locked. An ongoing Android notification shows the live countdown
  while the timer runs, including on the lock screen and while another app is open.
  (Earlier used Local Notifications, but a notification only gives a
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
| `src/restNotifications.ts` / `src/restAlarm.ts` | Schedule/cancel the native locked-screen rest vibration and countdown notification via the custom `RestAlarm` plugin; no-op on web. |
| `android/.../RestAlarmPlugin.java` + `RestVibrationReceiver.java` + `RestTimerNotification.java` | Alarm-clock-grade exact scheduling, four equal 800ms maximum-amplitude pulses at 3/2/1/0, and the ongoing system countdown. `preview()` plays the exact vibration waveform used by a real timer. |
| `android/.../AppHapticsPlugin.java` | Native semantic interaction haptics via `View.performHapticFeedback`; maps Selection, Confirm, Reject, Drag Start, and Drag Drop to device-tuned Android effects with older-version fallbacks. This path respects the system Touch feedback setting. |
| `src/index.css` | Global resets, base dark background, font. |
| `src/domain.ts` | Pure, tested workout logic: result toggling, auto-advance, rest clamping, countdown math. |
| `src/dataValidation.ts` | Deep validation for imported backups, templates, sessions, and legacy variant overrides. |
| `src/storage.ts` | `localStorage` get/set wrappers that never throw (private mode / quota) so storage failures can't crash the app. Use these instead of `localStorage` directly. |
| `src/haptics.ts` | **The one central semantic haptic service.** It exposes `selection()`, `confirm()`, `reject()`, `dragStart()`, `dragDrop()`, `timerFinished()`, and the non-vibrating `cancelTimerAlert()` cleanup. There is no global button listener. Navigation, open/close, back/cancel, card expansion, focus, typing, scrolling, and generic presses are silent. Normal native interactions call `AppHapticsPlugin`; the timer alone uses the deliberate custom waveform. If an auto-updated web bundle reaches an older APK without the native plugin, interaction haptics fail silently instead of bypassing Android's setting. |
| `src/ErrorBoundary.tsx` | Top-level React error boundary (wraps `App` in `main.tsx`); shows a Reload screen instead of a blank page if a render throws. Saved data stays in `localStorage`. |
| `src/apkVersion.ts` | Fetches the latest released APK build number (GitHub releases) for the Settings download row. |
| `tests/*.test.ts` | Node-native unit tests for domain behavior and backup/data validation (no extra test dependency). |
| `.github/workflows/deploy.yml` | GitHub Pages pipeline: install, test, lint, build, upload artifact, deploy. |
| `.github/workflows/android.yml` | Android CI: test, Capacitor sync, compile a debug APK, publish it to a release. |
| `.github/workflows/keepalive.yml` | Twice-weekly Supabase REST query so the free-tier project never idles 7 days and gets paused. |
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
- **UI bookkeeping is sync-silent:** `scrollBySession` / `expandedBySession` changes persist to
  localStorage but do not advance `fitness-hub-v1-updated-at` or trigger a cloud push
  (`isMeaningfulChange` in `cloudSync.ts`). Only real edits (sessions, templates, prefs, baselines,
  current-session pointers, rest default) count for last-write-wins.
- Cloud sync is **offline-first and last-write-wins**: sign-in compares local and remote
  `updated_at`; newer validated remote data is pulled, otherwise local data is upserted. Later
  local changes debounce for 900ms before upload. Remote data must pass `isValidBackup` before it
  can replace the local cache. Sign-out never deletes local data. Offline edits advance the local
  timestamp and upload on the next change or on reconnect (a `window` `online` listener re-runs the
  sync), so single-device offline work is **preserved, not overwritten**. Continuation edits on the
  same account stay last-write-wins by timestamp.
  - **First-sign-in conflict guard:** a device records the account it last synced with
    (`SYNCED_ACCOUNT_KEY`). If you sign into an account that **already has data** from a device that
    holds its **own meaningful unsynced data** (different/empty `SYNCED_ACCOUNT_KEY`), the app does
    **not** auto-resolve — it shows a "Choose which data to keep" dialog (use account / keep this
    device), so neither side is silently overwritten. `resolveSyncConflict` then pulls or pushes and
    records the account. Continuations, empty devices, and brand-new accounts skip the prompt.
- Rest countdown state is wall-clock based (`restEndsAt`), not interval-count based. This prevents
  a suspended/locked app from resuming with a stale countdown. `RestAlarmPlugin` (Java) uses
  Android's alarm-clock-grade exact scheduling (`USE_EXACT_ALARM`, `setAlarmClock`) three seconds
  before zero → `RestVibrationReceiver` plays four equal 800ms maximum-amplitude pulses at 3, 2,
  1, and 0 via Vibrator/VibratorManager (manifest also needs `VIBRATE` + `WAKE_LOCK`).
  `RestTimerNotification` shows a system-managed countdown while the timer is active, including on
  the lock screen; Android 13+ asks for notification permission the first time a rest timer starts.
  `src/restNotifications.ts` calls it through the `RestAlarm` plugin (`src/restAlarm.ts`); no-op on
  web. Changing the vibration needs a native APK rebuild, not just a web deploy.

---

## 7. What is currently implemented (DONE)

Git history (newest first); each commit is a clean restore point. Entries are summaries — details
live in the commit messages and the feature list below.
- **History workout options + duration repair:** each History card is now one full-width target;
  tapping it opens `Workout options` with Edit workout, Edit duration (finished sessions only),
  Delete workout, and Cancel. Duration reuses the existing rest-time editor layout exactly: one
  shared minus button, manual hours/minutes fields, and one shared plus button with hold-stepper
  behavior. Edit workout opens the normal workout screen; its own pencil remains the only entry to
  structural edit mode. Duration validates 1 minute–23h 59m, updates `finishedAt` while preserving `createdAt`, and
  immediately recalculates the card and average. Finished/Unfinished chips share an exact 92px ×
  48px footprint. The old separate trash column was removed.
- Latest commit: **default workout seed refresh.** `defaultWorkouts` updated to match the user's
  revised spreadsheet: several exercises renamed (e.g. Chest-Supported Machine Row → Machine Row,
  Seated/Reverse Cable/Machine Chest/Rear-Delt Fly → Cable Fly/Machine Fly/Reverse Cable
  Fly/Reverse Machine Fly), a few setup notes shortened, Weighted Dip and Machine Lat Pulldown
  weights adjusted, and most rest times moved to 90–120s. IDs, categories, order, and the two
  `linkId` swap pairs are unchanged. Only affects a brand-new local store or confirmed reset —
  existing saved templates are untouched (see `normalizeTemplates`).
- Previous commit: **new logo, stable APK signing, tile swap.**
  (1) `public/app-icon.svg` replaced with the user's final barbell mark (equal-thickness bars on
  `#252730`); `resources/android-foreground.svg` redrawn to match; every generated asset rebuilt
  via `npm run generate-pwa-assets` + `npm run generate-android-assets` (favicon, PWA/apple icons,
  Android launchers, splash screens — splash composes the mark on `#252730`, no black flash).
  (2) **Stable debug signing:** `android/app/debug-signing.p12` (PKCS12, alias `fitnesshub`,
  password `android`, committed on purpose — debug-only key) is wired into
  `build.gradle signingConfigs.debug`. Before this, every CI run signed with a random key, so
  sideloaded updates always failed with "app not installed" and forced an uninstall. The user must
  uninstall/reinstall **one final time** (old random signature → this stable one); afterwards new
  APKs install over the old ones.
  (3) Home grid: Gym pass and Settings swapped places (Gym pass now sits next to History).
- Previous commit: **repository cleanup + Supabase keep-alive.** Removed dead `domain.ts` exports
  (`moveItem`, `clampRestSeconds`, `selectActiveVariantId`) and their tests, deleted the residual
  `PRODUCT.md`, rewrote `README.md` to match the current app, tightened this file (stale plan
  sections, duplicate status text), and added `.github/workflows/keepalive.yml` — a twice-weekly
  REST query that stops Supabase's free tier from pausing the project after 7 idle days.
- `566dcf9` / `bc6cc54` / `bcf1216` / `d7b4318` Four polish commits: the Test-vibration preview
  matches the real timer waveform; app-wide haptics standardized to five meanings (see the haptic
  audit bullet below); every user-facing string rewritten short and direct (copy audit below);
  dialog focus trapping, keyboard access, tap-target, and overflow hardening (interaction audit
  below).
- `a31a1a9` Menu polish: Gym pass became a grid tile plus a new **About** tile (six tiles, 3×2);
  the gym-pass dialog offers Remove or Upload, never both; dialog copy tightened; the rest dock's
  `+10s` and `Cancel` are equal-sized.
- `62114c5` **Five QoL features + backup check:** workout duration on History cards
  (`WorkoutSession.finishedAt`, stamped when the last displayed exercise gets a result); green
  "Workout complete" header state (`.ws-head-title span.complete`); rest **+10s** re-arms the
  native alarm via the shared `startRestAlarm(endsAt)` helper; optional per-exercise
  `ExerciseVariant.note` (editor field + quiet `.ws-note` line on the card); History = **28-day
  4×7 tracker** (`buildTrackerDays`) + **2×2 stats grid** (total / completion % / per-week / avg
  length — 4-across overflowed 375px); **Gym pass** (`AppData.gymPass`: canvas-downscaled ≤640px
  data-URL, PNG with JPEG fallback >400KB, synced via `isMeaningfulChange`, validated, shown on a
  white `.pass-image` pad with `image-rendering: pixelated`); export blob-URL revoke delayed 2s
  (same-tick revoke can abort the download). Import/export verified incl. invalid-file rejection.
- `8f513df` Square launcher tiles (icon top, text bottom, min-height 128px, single-line ellipsis);
  Android tile opens an explainer **dialog** with a status dot (accent "Update ready" / green "Up
  to date", `.sync-status.update`); `PasswordInput` eye toggle on every password field.
- `a37934d` Account/app entries became grid tiles matching History/Settings; the sign-in dialog was
  rebuilt on the standard 12px dialog grid (a wrapper div had collapsed it) with an `.auth-links`
  row; week-count subtitle removed. (The two prior Pages deploy failures were transient.)
- `c174e86` **Account system + menu upgrade:** Account dialog (sync status, "last synced" via
  `markSynced()` → `fitness-hub-v1-last-synced`, Sync now, Change password, Sign out);
  forgot-password reset emails (`resetPasswordForEmail` → `PUBLIC_APP_URL`) and a
  `PASSWORD_RECOVERY` set-new-password dialog (⚠️ Supabase Auth → URL Configuration must allow
  `https://echonad3.github.io/fitness_hub/` — the user configured this); **APK build stamping**
  (`android.yml` passes `-PappBuildNumber=${{ github.run_number }}` → `versionCode`; read back via
  `CapacitorApp.getInfo()`, builds ≤ 1 treated as unknown) compared against `fetchLatestApk`
  (build + release date). Cloud/APK rows left Settings.
- `9fd3d56` Increase-stage −/+ hold-to-repeat parity with the weight stepper; fixed the oversized
  "Increase weight by?" prompt (its size rule was dead CSS, out-specified by `.ws-weight strong`);
  **sync fix** — scroll/expand no longer bumps the sync timestamp or uploads
  (`isMeaningfulChange` in `cloudSync.ts`; UI bookkeeping persists locally but is sync-silent —
  previously a merely-scrolled device could overwrite real edits via last-write-wins); backup
  validation tightened (swap flags, increase fields).
- `9bc02a0` Three batches in one commit: **QoL polish** (hold-stepper ticks per real step, rest
  dock **drain bar** driven by `restDuration`, Settings notes auto-clear after 5s, finished-count
  bug fix — History/Resume now count displayed slots via `displayedGroups`/`isSessionFinished`,
  "Finished" chip wording); the app-wide **consistency audit** (semantic haptic groups: segmented
  controls and all lineup edits = `selection`, increase Accept/Cancel = `confirm` like Done/Failed,
  steppers silent at bounds; inline notes replaced `window.alert`; eye icons for Hide; radii →
  tokens, press-depth standardized 0.98/0.95, dialog cancels unified); and the **five live-app
  changes** (mm:ss everywhere with the `[−][m][s][+]` rest control, guidance box below
  Setup/Target, log-out re-prompts the sync choice, **swaps = hide + link flat model**, the
  **"Increase weight?" stage** — both fully described in the feature list below).
- Previous implementation: refresh the first-use/reset Workout A and Workout B seeds with the user's
  revised exercise names, setup notes, rest times, targets, weights, and baseline results. Existing
  saved routines are intentionally untouched; `y` maps to Done/success and `n` to Failed/failure.
- Previous implementation: replace universal button feedback with semantic, state-change-only
  haptics; add an Android `performHapticFeedback` bridge that respects system settings; change the
  locked-screen timer alert from ~6s pulses to one maximum-amplitude 3s vibration.
- `abe5872` Prevent haptics when scrolling from buttons
- `f79b1c2` Editor/haptics/swap overhaul from live APK feedback: grey −/+ steppers with a bold blue
  glyph (full blue fill was tried and walked back — only the save ✓ and selected Load segment stay
  filled); the Load segmented control; an editor horizontal-overflow fix (`minmax(0,1fr)` +
  `min-width:0`); per-variant last result; the danger-footer Remove that only persists on save (✓);
  68px collapsed edit rows matching session rows; conflict-prompt Cancel; and a real
  setState-in-render bug fix. (Its universal-haptics listener was later replaced by the semantic
  haptic system.)
- Previous change: suppress incidental workout scrolling, seal the rest dock's lower edge, and make
  expanded exercise name/setup/target read-only (all routine edits remain under the header pencil).
- `8c90072` Establish a type/spacing scale and apply it app-wide
- `b1f53f5` Bigger UI, menu/settings icons, roomier tracker, cold-start to menu
- `2bd4096` Redesign main menu, start prompt, and history
- `2bbaf51` Universal back layers, dialog dismissal, free-entry rest length
- `b2a6cb5` Handle the Android hardware/gesture back button explicitly
- `f53555c` Back from a restored sub-screen returns to the menu, not app exit
- `3b7716d` Vibrate as an alarm so the rest buzz plays on a locked screen
- `26dadb1` Fix locked-screen buzz: timestamp lost in the Capacitor bridge
- `4466fad` Fix back-gesture sync, Settings header inset, and surface buzz errors
- `3d3941d` Edge-to-edge UI, clearer locked-buzz message, versioned APK download
- `b93dd91` Locked-screen rest alert: heavy ~6s native vibration, not a notification
- `1ef9f4b` PWA: auto-update the service worker on new deploys
- `13c71a7` Auto-updating APK, reconnect sync, and easy one-tap install
- `6cc245f` Fix Android APK blank screen: build with root base, not Pages subpath
- `8cafaab` Add Android wrapper and locked-screen rest alerts
- `2acf51f` Record successful PWA deployment
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
- **Default/reset routine seed** — `defaultWorkouts` contains the current user-specified Workout A/B
  lineup, including per-exercise rest times and the two Workout B fly swap groups. It is used only
  for a brand-new local data store or confirmed app-data reset; normalization preserves existing
  saved templates rather than silently replacing them.
- **Workout/session screen** — fixed-order list, active exercise expands in place, muscle colors
  (outline + dot + category word), guidance sentence (green increase / coral repeat), read-only
  exercise name and Setup/Target tiles, big weight stepper (−1.25/+1.25, tap value to edit), big
  Done/Failed (tap-again clears, auto-advances to next pending), progress rail, and a full-width rest
  dock whose opaque lower mask prevents exercise content leaking below it; while the timer runs a
  thin accent drain bar along the dock's bottom edge shows remaining rest at a glance. Viewport-fit sessions
  suppress up to 64px of incidental overflow; longer routines retain normal scrolling.
- **Home hub** (`main`) — title + date subtitle, **Resume** card (only for an unfinished latest
  session), **Start** (auto-suggests the opposite of the last workout), then a 3×2 grid of square
  launcher tiles: **History**, **Settings**, **Sign in / Account** (live sync-status dot),
  **Android app** (version-aware status dot; opens the download dialog), **Gym pass** (the saved
  entry QR; opens its dialog), and **About** (short app summary). No browser confirms.
- **History** — full-width cards, relative + absolute time, equal-size green **Finished** / red
  **Unfinished** chips with the displayed-slot count, the 28-day tracker, and a `Workout options`
  dialog for opening, editing a finished duration, or deleting. Duration editing accepts manual
  hours/minutes or the standard hold-to-repeat −/+ controls.
- **Settings** — Export/Import JSON backup, Test vibration, Reset (cloud sync and the APK download
  live on the home hub now). Export/Import and vibration outcomes show as inline notes on their
  rows (no browser alert popups anywhere in the app) and auto-clear after 5 seconds.
- **Account management** — optional email/password auth with create-account, forgot-password reset
  emails, a recovery flow that prompts for a new password, an Account dialog (sync status, last
  synced, Sync now, Change password, Sign out), and a home-tile sync status.
- **Gym pass** — the user's gym entry QR code, uploaded as an image (canvas-downscaled data URL in
  `AppData.gymPass`, synced + backed up), shown full-size on a white pad from its home tile. The
  dialog offers Upload (when empty) or Remove (when set) — never both.
- **About tile** — a short app-summary dialog; the user called it temporary (it fills the sixth
  grid slot until something better exists).
- **In-place editing** — the pencil turns the workout screen into edit mode *on the same screen* (no
  separate menu, no dialog). Each exercise becomes a drag-sortable accordion (`EditableExerciseItem`,
  grip handle, press-and-hold to drag) whose expanded body is the **inline editor**. The editor is
  built from a reusable `VariantFields` component (name, muscle chips, Sets/Reps/Weight, setup, and a
  **Load segmented control** — Total / Per hand, both visible), a Rest control (`[−] [m] [s] [+]`),
  and a footer with **Hide**, **Link/Unlink**, and **Remove exercise**. Stepper −/+ are compact grey
  (`--raised`) buttons with a bold blue accent glyph and an accent-tinted border for contrast (not
  blue-filled). The "doing"
  controls (Done/Failed, guidance, rest dock, rail) hide in edit mode. **Add exercise** inserts a
  blank exercise expanded in place. Field edits update the template variant and mirror the shared
  fields (setup/sets/reps/weight) into the open session. **Save/discard:** header shows ✕ (discard,
  left) and accent ✓ (save, right); entering snapshots `templates`+`sessions` and clears a dirty
  flag, any edit sets it. ✓ keeps; ✕ / back gesture, if dirty, shows the styled **confirm dialog**
  (Keep editing / Discard) — decline re-pushes the consumed history entry, Discard restores the
  snapshot.
- **Swaps = hide + link** — every exercise is its own flat, reorderable row; each `ExerciseGroup`
  holds one exercise plus optional `hidden?` / `linkId?`. In the editor, **Hide** dims a row and drops
  it from the workout; **Link** pairs it with another (shared `linkId`, topmost stays visible), shown
  with a `⇄ partner` badge and **Unlink**. `displayedGroups()` collapses a linked pair on the workout
  screen to one slot at the topmost member's position with a **"Swap with X"** button (`swapLinked`).
  Pairs only; each exercise keeps its own rest and its **own weight/last result** — `findPreviousTarget`
  finds the most recent session where that exercise had a logged result, so history is per-exercise.
- **"Increase weight?" stage** — for an exercise whose last result was a success, the freshly-opened
  card first asks "Increase weight by?" (−/+ seed 0 / 1.25 then step ±1.25; tap the box to type the
  add amount) with Apply/Keep weight in place of Done/Failed. Apply adds the amount on top of the carried
  weight; Keep weight leaves it unchanged; both set `increaseResolved` so the prompt does not reappear.
  Failed/no-record exercises skip straight to the normal controls.
- **Per-exercise rest** — each `ExerciseGroup` has its own `restSeconds` (migrated in for older
  saves via `normalizeTemplates`, validated as optional). The rest dock starts and labels from the
  **active exercise's** rest, so tapping a different exercise changes the timer; edit it inline via
  two `[m]`/`[s]` windows (combined and clamped 5s–10m on commit). No global rest control anymore.
  **All times display as mm:ss** app-wide (`formatTimer`); there is no seconds-only or `1m30s` format.
- **Semantic haptics** — no feedback for navigation, opening/closing UI, back/cancel, expansion,
  focus, typing, scrolling, or generic presses. Light semantic feedback is limited to actual
  selections, discrete value changes, toggles, and drag start/drop; medium feedback covers logged
  Done/Failed results (the same effect), saved edits, successful backup/auth actions, invalid input,
  and failures; destructive confirmations use a strong effect. Android uses system-aware semantic
  constants, while the locked-screen rest alarm remains a separate four-pulse maximum-amplitude alert.
  The old raw `@capacitor/haptics` dependency was removed so there is only one interaction path.
  Every numeric −/+ stepper (sets, reps, rest, weight, increase amount, and History duration) applies a quick tap on
  release and delays repeat until 380ms, so a touch that becomes scrolling is cancelled before either
  the value or haptic can change. Deliberate holds repeat every 110ms with one Selection per real step.
  **Grouping rules (2026-07-02 audit):** segmented controls (Load Total/Per hand) and muscle chips
  use `selection` on both/all options — never `toggle-on/off`, whose Android TOGGLE_OFF effect is
  near-imperceptible; all lineup edits (hide/show, link/unlink, swap, add; reorder via drag) share
  the light selection/drag group; the increase stage's Apply **and** Keep weight actions both use `confirm`
  (same pair as Done/Failed); a stepper tap that cannot change the value (at a bound) is silent.
  `toggle-on/off` remains only on the rest dock start/cancel.
- **Confirm dialogs** — all destructive confirms (discard edits, delete exercise, delete workout,
  reset) use one styled root-level `confirmDialog` ({title, message, confirmLabel, danger, haptic,
  onConfirm}), never `window.confirm`. It participates in the overlay/back system like other dialogs.
- **Release hardening** — edit mode now edits the variant active in that session, full-editor
  setup/target/weight changes stay in sync with the open session, the final exercise cannot be
  removed, backup imports are deeply validated, and React hook lint warnings are resolved.
- **Automated safety net** — `npm test` runs Node-native unit tests covering result toggles,
  auto-advance, rest bounds, wall-clock countdown math, backup/template/session validation
  (including swap flags, increase fields, notes, `finishedAt`, `gymPass`), cloud timestamp parsing,
  sync direction, migration safety, monotonic timestamps, and the meaningful-change rule.
- **Consistency polish** — home accent glow was removed, shared glow/depth/radius/focus tokens now
  drive every screen, dialogs reserve filled blue for the primary action, and compact icon targets
  are 42px. Phone audit covered home, workout, history, settings, edit mode, and the editor dialog.
- **Frontend interaction hardening (2026-07-11 audit)** — the existing visual system and information
  architecture were retained. Dialogs now move focus inside, trap keyboard focus, restore the prior
  focus target, close safely with Escape/back, and scroll within short or keyboard-reduced viewports.
  Dialog fields share the visible focus treatment; disabled/busy auth actions expose their state;
  inline errors announce immediately. Settings backup import and gym-pass upload remain full-row tap
  targets while also being keyboard/switch accessible. Primary editor utility controls and the workout
  swap action now meet the shared 48px tap target. The cloud-data conflict prompt now participates in
  overlay history and follows its safe sign-out path when dismissed with Back. Collapsed workout and
  editor panels are inert and hidden from assistive navigation, so their zero-height controls cannot
  enter keyboard/screen-reader order. Dialogs lock background scrolling while preserving their own
  short-screen scrolling. The lighter `--accent-text` foreground token raises small blue text/icons
  above the established contrast threshold. The rest-dock lower mask is viewport-fixed, eliminating
  incidental document overflow without disabling real scrolling on shorter screens.
- **App-wide copy audit (2026-07-11)** — every user-facing string in screens, cards, settings,
  workout controls, dialogs, confirmations, status messages, errors, empty states, placeholders,
  accessibility labels, and PWA metadata was reviewed and rewritten in short, direct, plain English.
  Marketing language, metaphors, filler, repeated explanations, and inconsistent session/workout
  terminology were removed. Destructive prompts still state the consequence, sync errors still protect
  and describe local data, and action labels now use direct verbs such as Save, Delete, Sync, Download,
  Apply, and Stop. A second codebase search confirmed the retired copy is gone from user-facing code.
- **App-wide haptic audit (2026-07-11)** — all screens, dialogs, prompts, failures, controls, file
  actions, sync paths, drag events, and timer paths were classified. Equivalent interactions now use
  one of five normal meanings: Selection, Confirm, Reject, Drag Start, or Drag Drop. Done and Failed
  share Confirm. Steppers fire Selection only after a real value change. Confirmed deletion/reset,
  workout start/resume, edit save, exercise updates, successful manual sync, auth, backup/import, and
  download start use Confirm after success. Invalid input and failed sync/import/export/native alarm
  use Reject. Navigation, Back/Close/Cancel, dialog open/dismiss, expansion, typing, scrolling, rest
  start, and rest stop are silent. Background autosync is silent on success; a manual Sync is tracked
  so it confirms once without a duplicate. Drag pickup and a valid changed drop each fire once.
  `timerFinished()` is separate: native completion is owned by the exact alarm, web completion runs
  the waveform directly, and Test vibration previews the exact same four-pulse pattern.
  A final repository search found no legacy haptic event names, raw UI vibration calls, generic button
  hook, or custom timer vibration outside the central service/native timer receiver. Post-release
  verification passed at 412×915: manual sync moved from Syncing to Synced; Done and Failed were each
  logged and restored; rest start/stop worked; and the delete confirmation was cancelled without a
  data change. The browser console stayed clean. The live Pages site returned HTTP 200, its deployed
  bundle contained the final semantic haptic service and timer waveform, and both Deploy and Android
  workflow badges were passing.
  Follow-up polish replaced that waveform with four equal strong pulses at 3, 2, 1, and 0
  seconds remaining. The native exact alarm now starts three seconds before the end, while the web
  timer starts the same waveform when its wall-clock countdown reaches 3. Sets, reps, rest time,
  session weight, and increase amount now all share one hold-stepper implementation (380ms delay,
  110ms repeat, one Selection per real step, silent at bounds).
- **Safety net** — real git repo (the original `.git` was empty/broken). "Undo everything" = ask
  to restore commit `5adba7c`.
- Removed: the `impeccable` design tool (`.agents`, `.impeccable`, `.codex/hooks.json`), ~600+
  lines of dead CSS, unused images. Project went 122 → ~20 tracked files.
- **LIVE** — deployed to GitHub Pages at **https://echonad3.github.io/fitness_hub/** via the
  Actions workflow; auto-deploys on every push to `main`.
- **Cloud sync** — complete and verified cross-device (details in §6). Paused syncs expose a Retry
  action; sign-out shows a busy state and reports failures; timestamps stay strictly monotonic.
- **PWA** — installable manifest, dark install icons, standalone/portrait mode, Workbox service
  worker with `autoUpdate` (a previously cached client can serve the old version for one load while
  the new worker activates — reopen once; expected, not a bug).
- **Native Android** — Capacitor 8 wrapper, exact-alarm rest vibration, semantic haptics bridge,
  branded launcher/splash icons, CI-built APK on every push. This machine has no Java/Android SDK,
  so APKs come from GitHub Actions only. Native (Java/config) changes reach the phone only via a
  reinstalled APK; web changes auto-update through the live site. The pending physical-device check:
  confirm the four equal 800ms timer pulses begin at 3 seconds remaining and that the notification
  countdown plus vibration both continue with the screen locked and another app foregrounded.

Every phase shipped green (tests, lint, strict build) and was click-verified in a phone-sized
browser preview at the time it landed; the 2026-07-11 audit passes additionally verified dialog
behavior and overflow at 412×915, 412×800, 360×800, and 360×500. Where a preview tool was
unavailable, the entry above says so.

---

## 8. Status and what's next

Everything planned so far has shipped: hosting (GitHub Pages, auto-deploy on push to `main`), PWA,
native Android wrapper, cloud sync with account management, and the QoL/audit rounds in §7. To
release a change: commit and `git push`.

**Supabase operational notes:**
- Project `jrsowjbxenkrmzzknnab.supabase.co`; one row per user in `public.app_state`
  (`user_id uuid pk`, `data jsonb`, `updated_at timestamptz`), RLS restricts each row to its owner.
  The URL + publishable key in `src/cloudConfig.ts` are public-safe.
- The free tier pauses the project after 7 idle days. `.github/workflows/keepalive.yml` queries the
  REST API twice a week to prevent that. A paused project must be resumed once by the user from the
  Supabase dashboard. GitHub suspends cron workflows in repos with no commits for 60 days — it
  emails a warning; one click (or any push) re-enables.
- Sign-up requires email confirmation unless "Confirm email" is disabled in Supabase Auth settings.
- Password-reset emails redirect to the live app URL, which must stay listed in Supabase Auth →
  URL Configuration (done).

**Future idea — selectable workout splits (not built).** Let a user pick a split type (Push/Pull/
Legs, upper/lower, custom) in Settings instead of the fixed A/B pair. Design rules when built:
the menu already treats "up next" generically, so a split just defines more workouts; never mix
splits in one rotation — the active split owns the whole list; History, the tracker, and Resume
already work for any number of workouts.

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
- **Browser verification default:** after pushing, use the deployed app at
  `https://echonad3.github.io/fitness_hub/` for the final 412×915 click-through. It is more reliable
  across Codex turns than a background localhost process and tests the exact released bundle. Use
  localhost only for pre-push checks; on this Windows machine launch it through the installed
  `C:\Program Files\nodejs\npm.cmd`, never a temporary `codex-npm-bootstrap` path that can be cleaned
  up between turns. The live origin has separate local storage, so sign into the test account when
  existing History data is required and cancel or restore any temporary data edits.
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
