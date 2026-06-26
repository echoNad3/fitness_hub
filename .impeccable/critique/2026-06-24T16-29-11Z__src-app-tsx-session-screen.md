---
target: session screen
total_score: 19
p0_count: 0
p1_count: 4
timestamp: 2026-06-24T16-29-11Z
slug: src-app-tsx-session-screen
---
# Impeccable Critique: Session Screen

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Progress, result, and timer exist, but they are split across tiny dots, small chips, and a floating timer instead of one clear workout state. |
| 2 | Match System / Real World | 3 | Exercise language is appropriate for a known lifter, but labels like "increase" and "repeat" are too abstract under fatigue. |
| 3 | User Control and Freedom | 2 | Back/current controls exist, but current workout control is top-heavy and card-level click behavior makes expansion feel fragile. |
| 4 | Consistency and Standards | 2 | Components are internally consistent, but card, chip, stripe, pill, and button treatments all compete in one small screen. |
| 5 | Error Prevention | 2 | Local autosave helps, but result marking and weight changes are one-tap state changes with weak review affordance. |
| 6 | Recognition Rather Than Recall | 2 | Setup, target, load, previous guidance, and current result are visible, but compressed into tiny fragments that require interpretation. |
| 7 | Flexibility and Efficiency | 2 | The app supports quick taps, but primary controls are buried inside the expanded card rather than arranged as a command panel. |
| 8 | Aesthetic and Minimalist Design | 1 | The interface is visually noisy: equal cards, category colors, side stripes, pills, borders, and shadows dilute priority. |
| 9 | Error Recovery | 2 | Data is local and editable, but recovery flows rely on modals/alerts and do not feel integrated into the workout screen. |
| 10 | Help and Documentation | 1 | Fine for a personal tool, but there is no inline explanation where terse labels become ambiguous. |
| **Total** | | **19/40** | **Poor: major UX overhaul required for the workout screen.** |

## Anti-Patterns Verdict

This does not look like a sharp gym command panel. It looks like a compact SaaS card stack reskinned for fitness: dark surfaces, soft shadows, side accent stripes, colored category chips, and small pill states. The structure is competent enough to function, but the visual language is generic and overly componentized.

The strongest AI-design tell is the repeated "card with 1px border, shadow, side stripe, pill label, tiny metadata" pattern. The side stripe appears on exercise cards and other cards. It gives every row a decorative accent but does not help the lifter decide what to do next.

Deterministic scan: `node .agents/skills/impeccable/scripts/detect.mjs --json src\App.tsx` returned no findings. This misses the real problem because the problem is not static copy or a detector-known slop rule in TSX; it is the combined interaction and CSS treatment in the session surface.

Visual overlays: browser overlay was unavailable. The in-app browser tool is not exposed in this session, and Playwright could not launch because its Chromium binary is not installed locally. No reliable user-visible overlay exists for this run.

## Overall Impression

The screen technically contains most of the right data, but it gives the wrong things the same visual importance. The current exercise, previous guidance, current weight, result decision, progress, and timer should feel like one active command surface. Instead, they are scattered across a sticky header, card row, right-side chips, inline controls, and a separate floating timer.

Single biggest opportunity: stop treating every exercise as a card. Treat the current exercise as the command panel and the remaining exercises as a low-noise queue.

## What's Working

- The product model is strong: Workout A/B, session persistence, setup, target, weight, previous guidance, result, and rest timer are the right primitives.
- Touch targets for the main control buttons are mostly large enough at 44px minimum.
- The app already supports reduced motion and avoids keyboard entry for the main workout path except manual edits.

## Priority Issues

### [P1] The screen has no dominant "current exercise" hierarchy

Why it matters: In the gym, the user should land on the screen and instantly know: this is the current lift, this is the target, this is the weight, this is what I should do after the set. The current UI makes every exercise card similar, so the active exercise is only slightly larger and darker than the rest.

Fix: Replace the expanded card with a full command-panel treatment. The active exercise should occupy the top of the content area under the header as a purpose-built panel, not as one card in the same list. It needs a strong title, a compact meta rail, a clear guidance sentence, large weight controls, and primary result controls. The rest of the exercises should become compact queue rows.

Suggested command: `$impeccable shape session screen redesign`

### [P1] The expanded card is not a workout control surface

Why it matters: The expanded state adds controls below the same summary row, but it does not reorganize the task. The user still has to parse a category badge, exercise title, summary line, guidance chip, label, weight row, label, and result row. This is too much scanning while tired.

Fix: Redesign the expanded state as a vertical task sequence: exercise identity -> previous/result guidance -> target/setup/load -> weight adjustment -> result decision. Remove decorative category badge prominence. Do not make the summary row fight the controls.

Suggested command: `$impeccable layout session screen`

### [P1] Color is doing decoration instead of hierarchy

Why it matters: PRODUCT.md explicitly rejects gamer/RPG colors and excessive gloss. The current category palette uses purple, teal, amber, orange, green, red, and gray in close proximity. This makes the UI feel like a category-coded dashboard, not a calm command tool.

Fix: Use restrained dark neutrals with one active accent and semantic colors only for result states. Category can be a tiny label or muted dot, not a rainbow side stripe plus outlined pill. Success/failure should dominate only at the moment of result marking.

Suggested command: `$impeccable colorize session screen`

### [P1] Timer placement is detached from the workout action

Why it matters: The rest timer is a fixed pill at bottom-right. It is reachable, but it floats over the scroll surface and is visually separate from the result action that usually starts rest. This makes it feel bolted on rather than part of the set flow.

Fix: Move timer behavior into a bottom command dock or active-exercise panel. After "Done" or "Failed", show an obvious rest state with start/cancel/remaining time in the same command area. If it remains fixed, make it full-width or bottom-docked so it does not compete with cards.

Suggested command: `$impeccable polish session screen`

### [P2] Status controls are too quiet and too late in the visual order

Why it matters: The core decision after a set is Done or Failed. Today that decision is below a small "Result" label, visually similar to weight buttons, and only selected state makes one option forceful. The current status chip appears only after a result exists and sits as another small pill near the guidance chip.

Fix: Make result controls the primary action group for the active exercise. Use a segmented control or two large buttons with unmistakable selected states. Keep current result visible even before selection as "Not marked" instead of absence.

Suggested command: `$impeccable harden session screen`

## Replacement Direction

Replace the card stack with a "workout command panel" pattern:

1. Header: compact top bar with Back, Workout A, 2/6 done, and a readable progress rail. No separate "Current" button unless the current panel can scroll away.
2. Active panel: one dominant panel for the current exercise. Title first. Category as low-emphasis text or dot. Show setup, target, and load as three compact facts.
3. Guidance: convert "increase/repeat/no guidance" from a small chip into a sentence like "Last result: failed. Repeat 32 kg/hand." This is guidance, not a badge.
4. Weight control: central large weight value with minus/plus controls adjacent. Manual edit remains tap-on-value.
5. Result control: bottom of the active panel, two large segmented actions, Done and Failed, with selected state always visible.
6. Timer: bottom dock tied to set result, not a detached floating pill. It should show idle, running, and done states in the same location.
7. Queue: upcoming exercises as compact rows with title, target/load, and state. No shadows, no side stripes, no colored category pills.

## Persona Red Flags

**Alex, impatient power user**: Alex can start a session quickly, but the working screen does not feel optimized. The active exercise is not dominant, result controls are buried below metadata, and the timer is detached from the done/fail decision. Alex will tolerate it, but will feel the UI is slower than a native notes/checklist flow.

**Sam, accessibility-dependent user**: Focus states exist, and aria-pressed is used for result buttons, but state meaning is heavily visual. The progress dots do not identify which exercise each dot represents. Current result absence is not announced as a state; it is simply missing. The guidance button text is terse and context-poor.

**Casey, distracted mobile user**: Casey uses one hand in a distracting physical environment. Back and Current are at the top. The main Done/Failed decision is not in a persistent thumb-zone command area. The bottom-right timer competes with scrolling content and can obscure the end of the card stack.

**Project-specific: tired lifter mid-set**: The user needs fast recognition, not exploration. The screen asks them to interpret too many small visual tokens: category color, category pill, progress dots, guidance pill, current-status pill, labels, and control rows. This is exactly the wrong load profile for use while breathing hard.

## Minor Observations

- The category badge consumes too much horizontal room for information the user already knows.
- The six progress dots are abstract; they show quantity but not where the user is in the exercise queue.
- The 150px exercise-list bottom padding is compensating for a floating timer rather than designing a coherent bottom command area.
- The `Current` button is only useful if the user has scrolled away, but it is always visible and competes with Back.
- The UI uses uppercase micro-labels in a few places, which adds dashboard texture without improving gym usability.

## Questions to Consider

- What if the current exercise were not a card at all, but the screen's main control surface?
- What information does the lifter need before the set versus after the set?
- Does category color matter during a workout, or is it decoration that should disappear?
- Should the timer start from the result decision instead of living as a separate floating control?
