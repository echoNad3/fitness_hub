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
- **Everything autosaves** to **localStorage** (no backend yet).
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
| `src/index.css` | Global resets, base dark background, font. |
| `src/domain.ts` | Pure, tested workout operations: result toggling, reordering, auto-advance, rest clamping, active-variant selection. |
| `src/dataValidation.ts` | Deep validation for imported backups, templates, sessions, and legacy variant overrides. |
| `tests/*.test.ts` | Node-native unit tests for domain behavior and backup/data validation (no extra test dependency). |
| `.github/workflows/deploy.yml` | GitHub Pages pipeline: install, test, lint, build, upload artifact, deploy. |
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
  `fitness-hub-v1` (data) and `fitness-hub-v1-screen` (current screen).
- Imported JSON must pass `isValidBackup` before it can replace local data. Invalid or structurally
  incomplete templates/sessions are rejected rather than trusted through a TypeScript cast.
- TypeScript is strict (`noUnusedLocals`): unused functions/locals **fail the build**. Remove dead
  code as you go.
- Screens: `main` (home hub), `global-history`, `settings`, `session`. (The old `workouts` /
  `workout-menu` / `workout-history` screens were removed in Phase 2.)
- Icons are inline SVGs via the `Icon` component (`name` switch). No icon library.

---

## 7. What is currently implemented (DONE)

Git history (newest first); each commit is a clean restore point:
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
- **Automated safety net** — `npm test` runs nine Node-native unit tests covering result toggles,
  ordering, auto-advance, rest bounds, active-variant selection, legacy migration acceptance,
  template validation, and session validation.
- **Consistency polish** — home accent glow was removed, shared glow/depth/radius/focus tokens now
  drive every screen, dialogs reserve filled blue for the primary action, and compact icon targets
  are 42px. Phone audit covered home, workout, history, settings, edit mode, and the editor dialog.
- **Safety net** — real git repo (the original `.git` was empty/broken). "Undo everything" = ask
  to restore commit `5adba7c`.
- Removed: the `impeccable` design tool (`.agents`, `.impeccable`, `.codex/hooks.json`), ~600+
  lines of dead CSS, unused images. Project went 122 → ~20 tracked files.
- **LIVE** — deployed to GitHub Pages at **https://echonad3.github.io/fitness_hub/** via the
  Actions workflow; auto-deploys on every push to `main`.

All phases above were verified live (build, lint, tests, browser DOM checks, console checks, and
390×844 browser-preview screenshots) before committing.

---

## 8. What is left (the plan ahead)

**✅ Phase 4: Hosting — DONE.** The app is **LIVE at https://echonad3.github.io/fitness_hub/**
(verified HTTP 200; assets served correctly under `/fitness_hub/`). Repo `echoNad3/fitness_hub`,
Pages **Source = GitHub Actions**, auto-deploys on every push to `main` via
`.github/workflows/deploy.yml` (runs tests → lint → build → deploy). To ship a change: commit to
`main` and `git push` — that's the whole release process now.

**NEXT (deferred features, in priority order):**

1. **PWA** — installable / add-to-home-screen / offline.
2. **Native wrap (Capacitor)** so the **rest timer works while the phone is locked**. NOTE: a plain
   web app/PWA *cannot* reliably keep a countdown alive once locked — the OS suspends it. The real
   options are (a) a scheduled **local notification** at +Ns (fires even locked), or (b) the native
   wrap. Set this expectation with the user; don't promise locked-screen timing from PWA alone.
3. **Cloud sync + login (IN PROGRESS — current focus).** Approach: **Supabase** (free tier, works
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
   - **Config:** Supabase URL + anon key live in a committed config file (public-safe with RLS) or
     Vite build env. **As of now: Step 1 — awaiting the user's Supabase project URL + anon key.**

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
