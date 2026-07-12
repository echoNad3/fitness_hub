import { useEffect, useMemo, useRef, useState } from 'react'
import { useId } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './App.css'
import './workout.css'
import './home.css'
import './chrome.css'
import './edit.css'
import { loadCloudState, saveCloudState, supabase, type CloudState } from './cloud'
import {
  chooseSyncDirection,
  hasMeaningfulLocalData,
  initialLocalTimestamp,
  isMeaningfulChange,
  nextLocalTimestamp,
  parseCloudTimestamp,
} from './cloudSync'
import { MAX_REST_SECONDS, MIN_REST_SECONDS, clampRestValue, nextPendingId, restSecondsRemaining, toggleResult, workoutDurationMinutes } from './domain'
import { isRecord, isValidBackup, isValidSessions, isValidTemplates } from './dataValidation'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { cancelRestNotification, scheduleRestNotification } from './restNotifications'
import { fetchLatestApk, type LatestApk } from './apkVersion'
import { AppUpdater, type AppUpdateState } from './appUpdater'
import { getStored, setStored } from './storage'
import { haptics } from './haptics'

type WorkoutId = 'workout-a' | 'workout-b'
type ResultStatus = 'success' | 'failure'
type PreviousResult = ResultStatus | 'missing'
type Category = 'CHEST' | 'BACK' | 'SHOULDERS' | 'BICEPS' | 'TRICEPS' | 'CORE' | 'LEGS'

type ExerciseVariant = {
  id: string
  name: string
  category: Category
  setup: string
  sets: number
  reps: number
  weight: number
  perHand: boolean
  lastResult: PreviousResult
  // Optional free-text note ("grip felt off", "try seat 5") shown quietly on the workout card.
  note?: string
}

// A group is a single exercise slot. `variants` always holds exactly one exercise now (swaps are no
// longer nested); the swap feature is expressed with `linkId` instead. Kept as an array so the session
// storage (entries keyed by variant id) and the many variant helpers stay unchanged.
type ExerciseGroup = {
  id: string
  activeVariantId: string
  variants: ExerciseVariant[]
  // Rest countdown length for this exercise (seconds). Per-exercise, edited in the workout editor.
  restSeconds: number
  // Hidden exercises are dimmed in edit mode and skipped on the workout screen.
  hidden?: boolean
  // Two exercises sharing a `linkId` are a swap pair: only the visible (non-hidden) one shows on the
  // workout screen, at the position of whichever pair member sits higher in the list, with a
  // "Swap with …" button to flip which is visible.
  linkId?: string
}

type WorkoutTemplate = {
  id: WorkoutId
  name: string
  groups: ExerciseGroup[]
}

type SessionExercise = {
  weight: number
  setup?: string
  sets?: number
  reps?: number
  result?: ResultStatus
  // "Increase weight?" confirmation stage (only for exercises whose last result was a success).
  // increaseResolved: the user has confirmed/declined the increase for this session, so the card
  // shows normally. increaseDelta: the pending amount to add while that stage is open (undefined =
  // the "Increase weight by?" prompt before any amount is chosen).
  increaseResolved?: boolean
  increaseDelta?: number
}

type SessionGroup = {
  activeVariantId: string
  entries: Record<string, SessionExercise>
}

type WorkoutSession = {
  id: string
  workoutId: WorkoutId
  createdAt: number
  // Set when the last displayed exercise gets a result (the session transitions to finished), so
  // History can show how long the workout took.
  finishedAt?: number
  groupEntries: Record<string, SessionGroup>
}

type AppData = {
  sessions: WorkoutSession[]
  variantPrefs: Record<string, string>
  templates: WorkoutTemplate[]
  baselineResults: Record<string, PreviousResult>
  expandedBySession: Record<string, string>
  scrollBySession: Record<string, number>
  currentSessionByWorkout: Partial<Record<WorkoutId, string>>
  restSeconds: number
  // The user's gym entry QR code, stored as a downscaled data-URL image (shown from the home menu).
  gymPass?: string
}

type Screen =
  | { name: 'main' }
  | { name: 'global-history' }
  | { name: 'settings' }
  | { name: 'session'; workoutId: WorkoutId; sessionId: string }

type WeightDialog = {
  sessionId: string
  groupId: string
  variantId: string
  value: string
  // When set, the dialog edits the pending "increase weight by" amount instead of the absolute weight.
  increase?: boolean
}

type PreviousDialog = {
  workoutId: WorkoutId
  sessionId: string
  groupId: string
  variantId: string
}

// Picking which other exercise to link the given one to (for a swap pair).
type LinkDialog = {
  workoutId: WorkoutId
  groupId: string
}

type DurationDialog = {
  sessionId: string
  hours: string
  minutes: string
  error: string
}


type AuthDialog = {
  mode: 'in' | 'up'
  email: string
  password: string
  error: string
  note: string
  busy: boolean
}

// Setting a new password: 'change' from the account dialog, 'recovery' after a reset-email link.
type PasswordDialog = {
  mode: 'change' | 'recovery'
  value: string
  error: string
  busy: boolean
}

type CloudUser = {
  id: string
  email: string
}

type SyncStatus = 'idle' | 'checking' | 'syncing' | 'synced' | 'error' | 'conflict'
type AppUpdateUiState = AppUpdateState | { status: 'checking' | 'unsupported'; progress: number; detail?: string }

const STORAGE_KEY = 'fitness-hub-v1'
const LOCAL_UPDATED_KEY = 'fitness-hub-v1-updated-at'
// The account this device last synced with. Lets us tell a continuation (same account → auto
// last-write-wins) from a first sign-in to an account that already has data while this device holds
// its own unsynced changes (→ ask the user which to keep instead of silently overwriting one).
const SYNCED_ACCOUNT_KEY = 'fitness-hub-v1-synced-account'
// When this device last completed a successful cloud sync (push or pull), for the account UI.
const LAST_SYNCED_KEY = 'fitness-hub-v1-last-synced'
// Where password-reset emails send the user to set a new password (the live web app).
const PUBLIC_APP_URL = 'https://echonad3.github.io/fitness_hub/'
const APK_DOWNLOAD_URL = 'https://github.com/echoNad3/fitness_hub/releases/latest/download/app-debug.apk'
const SYNC_DEBOUNCE_MS = 900
const DEFAULT_REST_SECONDS = 90
const CATEGORIES: Category[] = ['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'CORE', 'LEGS']

const defaultWorkouts: WorkoutTemplate[] = [
  {
    id: 'workout-a',
    name: 'Workout A',
    groups: [
      singleExercise({
        id: 'incline-db-chest-press',
        name: 'Incline Dumbbell Press',
        category: 'CHEST',
        setup: '20°',
        sets: 4,
        reps: 7,
        weight: 32,
        perHand: true,
        lastResult: 'failure',
      }, 120),
      singleExercise({
        id: 'chest-supported-row-machine',
        name: 'Machine Row',
        category: 'BACK',
        setup: '5-top',
        sets: 4,
        reps: 7,
        weight: 46.25,
        perHand: false,
        lastResult: 'failure',
      }, 120),
      singleExercise({
        id: 'cable-lateral-raise',
        name: 'Cable Lateral Raise',
        category: 'SHOULDERS',
        setup: 'bottom',
        sets: 3,
        reps: 15,
        weight: 2.5,
        perHand: false,
        lastResult: 'failure',
      }, 90),
      singleExercise({
        id: 'technogym-preacher-curl-machine',
        name: 'Machine Preacher Curl',
        category: 'BICEPS',
        setup: '6-top',
        sets: 3,
        reps: 11,
        weight: 15,
        perHand: false,
        lastResult: 'success',
      }, 90),
      singleExercise({
        id: 'overhead-cable-triceps-extension',
        name: 'Overhead Cable Extension',
        category: 'TRICEPS',
        setup: '15',
        sets: 3,
        reps: 11,
        weight: 12.5,
        perHand: false,
        lastResult: 'failure',
      }, 90),
      singleExercise({
        id: 'ab-wheel',
        name: 'Ab Wheel Rollout',
        category: 'CORE',
        setup: '',
        sets: 3,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'failure',
      }, 90),
    ],
  },
  {
    id: 'workout-b',
    name: 'Workout B',
    groups: [
      singleExercise({
        id: 'weighted-dips',
        name: 'Weighted Dip',
        category: 'TRICEPS',
        setup: '',
        sets: 4,
        reps: 7,
        weight: 16.25,
        perHand: false,
        lastResult: 'failure',
      }, 120),
      singleExercise({
        id: 'technogym-lat-pulldown',
        name: 'Machine Lat Pulldown',
        category: 'BACK',
        setup: '7-top',
        sets: 4,
        reps: 7,
        weight: 46.25,
        perHand: false,
        lastResult: 'failure',
      }, 120),
      singleExercise({
        id: 'overhead-db-shoulder-press',
        name: 'Dumbbell Overhead Press',
        category: 'SHOULDERS',
        setup: '',
        sets: 3,
        reps: 9,
        weight: 20,
        perHand: true,
        lastResult: 'failure',
      }, 90),
      singleExercise(
        {
          id: 'seated-cable-chest-fly',
          name: 'Cable Fly',
          category: 'CHEST',
          setup: '16',
          sets: 3,
          reps: 11,
          weight: 7.5,
          perHand: false,
          lastResult: 'failure',
        },
        90,
        { linkId: 'link-chest-fly' },
      ),
      singleExercise(
        {
          id: 'pec-deck-machine-chest-fly',
          name: 'Machine Fly',
          category: 'CHEST',
          setup: '9',
          sets: 3,
          reps: 11,
          weight: 10,
          perHand: false,
          lastResult: 'success',
        },
        90,
        { linkId: 'link-chest-fly', hidden: true },
      ),
      singleExercise(
        {
          id: 'reverse-cable-flyes',
          name: 'Reverse Cable Fly',
          category: 'SHOULDERS',
          setup: '22',
          sets: 3,
          reps: 11,
          weight: 2.5,
          perHand: false,
          lastResult: 'failure',
        },
        90,
        { linkId: 'link-reverse-fly' },
      ),
      singleExercise(
        {
          id: 'reverse-pec-deck-machine',
          name: 'Reverse Machine Fly',
          category: 'SHOULDERS',
          setup: '3',
          sets: 3,
          reps: 11,
          weight: 10,
          perHand: false,
          lastResult: 'success',
        },
        90,
        { linkId: 'link-reverse-fly', hidden: true },
      ),
      singleExercise({
        id: 'bulgarian-split-squat',
        name: 'Bulgarian Split Squat',
        category: 'LEGS',
        setup: '',
        sets: 3,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'failure',
      }, 90),
    ],
  },
]

function singleExercise(
  variant: ExerciseVariant,
  restSeconds = DEFAULT_REST_SECONDS,
  extra?: { hidden?: boolean; linkId?: string },
): ExerciseGroup {
  return {
    id: variant.id,
    activeVariantId: variant.id,
    variants: [variant],
    restSeconds,
    ...extra,
  }
}

const muscleColors: Record<Category, string> = {
  CHEST: '#d6b252', // gold
  BACK: '#b9c2cb', // silver
  SHOULDERS: '#a37f50', // bronze
  BICEPS: '#aa9fc9', // purplish silver
  TRICEPS: '#d98c4e', // warm orange
  CORE: '#e48fbf', // pink
  LEGS: '#e48fbf', // pink (same as core)
}

function muscleColor(category: Category): string {
  return muscleColors[category]
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'back':
      return (
        <svg {...props}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      )
    case 'forward':
      return (
        <svg {...props}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      )
    case 'download':
      return (
        <svg {...props}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...props}>
          <path d="M12 21V9" />
          <path d="M7 8l5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'cloud':
      return (
        <svg {...props}>
          <path d="M7 18h10.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.8-1.2A3.6 3.6 0 0 0 7 18z" />
        </svg>
      )
    case 'up':
      return (
        <svg {...props}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      )
    case 'down':
      return (
        <svg {...props}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...props}>
          <path d="M4 20h4L19 9l-4-4L4 16z" />
          <path d="M14 6l4 4" />
        </svg>
      )
    case 'minus':
      return (
        <svg {...props}>
          <path d="M5 12h14" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'check':
      return (
        <svg {...props}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )
    case 'arrow-up':
      return (
        <svg {...props}>
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      )
    case 'repeat':
      return (
        <svg {...props}>
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'play':
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z" />
        </svg>
      )
    case 'history':
      return (
        <svg {...props}>
          <path d="M3 3v5h5" />
          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          <path d="M12 7v5l4 2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...props}>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
          <path d="M1 14h6M9 8h6M17 16h6" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...props}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      )
    case 'close':
      return (
        <svg {...props}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )
    case 'info':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.5v.5" />
        </svg>
      )
    case 'qr':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3h-3z" />
          <path d="M21 14v1M14 20v1M18 21h3M21 18h-1" />
        </svg>
      )
    case 'eye':
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'eye-off':
      return (
        <svg {...props}>
          <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a20 20 0 0 1 5.06-5.94" />
          <path d="M9.9 5.24A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.22 4.31" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <path d="M3 3l18 18" />
        </svg>
      )
    case 'grip':
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      )
    default:
      return null
  }
}

const blurOnEnter = (event: { key: string; currentTarget: HTMLInputElement }) => {
  if (event.key === 'Enter') {
    event.currentTarget.blur()
  }
}

// Password field with an eye toggle to reveal what's being typed. Used by every password entry
// (sign in, create account, change/reset password).
function PasswordInput({
  value,
  autoComplete,
  onChange,
}: {
  value: string
  autoComplete: string
  onChange: (value: string) => void
}) {
  const [show, setShow] = useState(false)

  return (
    <span className="pw-field">
      <input
        className="number-input text-input"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="pw-toggle"
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={() => {
          setShow((current) => !current)
          void haptics.selection()
        }}
      >
        <Icon name={show ? 'eye-off' : 'eye'} size={19} />
      </button>
    </span>
  )
}

type HoldAction = () => boolean

// Every numeric −/+ control uses this exact interaction: a quick tap applies once on release;
// holding for 380ms starts a 110ms repeat. Each real step gets one Selection haptic, bounds stay
// silent, scrolling cancels the pending tap, and keyboard activation applies one step.
function useHoldStepper() {
  const holdRef = useRef<{ timeout?: number; interval?: number; action?: HoldAction; started?: boolean }>({})

  const stop = () => {
    if (holdRef.current.timeout !== undefined) window.clearTimeout(holdRef.current.timeout)
    if (holdRef.current.interval !== undefined) window.clearInterval(holdRef.current.interval)
    holdRef.current = {}
  }

  const start = (action: HoldAction) => {
    stop()
    holdRef.current.action = action
    holdRef.current.timeout = window.setTimeout(() => {
      holdRef.current.started = true
      if (action()) void haptics.selection()
      holdRef.current.interval = window.setInterval(() => {
        if (action()) void haptics.selection()
      }, 110)
    }, 380)
  }

  const finish = () => {
    const { action, started } = holdRef.current
    if (action && !started && action()) void haptics.selection()
    stop()
  }

  const bind = (action: HoldAction) => ({
    onPointerDown: () => start(action),
    onPointerUp: finish,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (action()) void haptics.selection()
      }
    },
  })

  useEffect(() => stop, [])

  return { bind, stop }
}

function DurationEditor({
  dialog,
  onChange,
  onCancel,
  onSave,
}: {
  dialog: DurationDialog
  onChange: (next: DurationDialog) => void
  onCancel: () => void
  onSave: () => void
}) {
  const hoursRef = useRef(dialog.hours)
  const minutesRef = useRef(dialog.minutes)
  hoursRef.current = dialog.hours
  minutesRef.current = dialog.minutes
  const holdStepper = useHoldStepper()

  const step = (delta: number) => {
    const hours = Number.parseInt(hoursRef.current, 10)
    const minutes = Number.parseInt(minutesRef.current, 10)
    const current =
      (Number.isFinite(hours) ? Math.max(0, hours) : 0) * 60 +
      (Number.isFinite(minutes) ? Math.max(0, minutes) : 0)
    const next = Math.min(23 * 60 + 59, Math.max(1, current + delta))
    if (next === current) return false
    const nextHours = String(Math.floor(next / 60))
    const nextMinutes = String(next % 60)
    hoursRef.current = nextHours
    minutesRef.current = nextMinutes
    onChange({ ...dialog, hours: nextHours, minutes: nextMinutes, error: '' })
    return true
  }

  return (
    <Dialog title="Edit duration">
      <div className="set-stepper rest-stepper">
        <button type="button" aria-label="Decrease duration" {...holdStepper.bind(() => step(-1))}>
          <Icon name="minus" size={18} />
        </button>
        <div className="rest-mmss">
          <label className="set-rest-field">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={dialog.hours}
              aria-label="Duration hours"
              onChange={(event) => onChange({ ...dialog, hours: event.target.value, error: '' })}
            />
            <span>h</span>
          </label>
          <label className="set-rest-field">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              step="1"
              value={dialog.minutes}
              aria-label="Duration minutes"
              onChange={(event) => onChange({ ...dialog, minutes: event.target.value, error: '' })}
            />
            <span>m</span>
          </label>
        </div>
        <button type="button" aria-label="Increase duration" {...holdStepper.bind(() => step(1))}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      {dialog.error && <p className="auth-error" role="alert">{dialog.error}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-action" type="button" onClick={onSave}>Save</button>
      </div>
    </Dialog>
  )
}

// The editable fields for a single exercise. Swap alternatives are equal siblings, so every one shows
// the full set of fields including its own muscle picker. Drafts are held locally and committed on
// blur so typing never fights the persisted value.
function VariantFields({
  variant,
  onPatch,
}: {
  variant: ExerciseVariant
  onPatch: (patch: Partial<ExerciseVariant>) => void
}) {
  const { name, category, setup, sets, reps, weight, perHand } = variant
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [setupDraft, setSetupDraft] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [weightDraft, setWeightDraft] = useState<string | null>(null)
  const setsRef = useRef(sets)
  const repsRef = useRef(reps)
  setsRef.current = sets
  repsRef.current = reps
  const holdStepper = useHoldStepper()

  const adjustSets = (delta: number) => {
    const next = Math.max(1, setsRef.current + delta)
    if (next === setsRef.current) return false
    setsRef.current = next
    onPatch({ sets: next })
    return true
  }

  const adjustReps = (delta: number) => {
    const next = Math.max(1, repsRef.current + delta)
    if (next === repsRef.current) return false
    repsRef.current = next
    onPatch({ reps: next })
    return true
  }

  // Commit on blur. Read the draft from state and call the parent update OUTSIDE any setState updater
  // (calling a parent setState inside an updater runs it during render → React warns/misbehaves).
  const commitName = () => {
    if (nameDraft !== null) {
      const nextName = nameDraft.trim()
      if (!nextName) {
        void haptics.reject()
        setNameDraft(null)
        return
      }
      if (nextName !== name) {
        onPatch({ name: nextName })
      }
      setNameDraft(null)
    }
  }
  const commitSetup = () => {
    if (setupDraft !== null) {
      const nextSetup = setupDraft.trim()
      if (nextSetup !== setup) {
        onPatch({ setup: nextSetup })
      }
      setSetupDraft(null)
    }
  }
  const commitNote = () => {
    if (noteDraft !== null) {
      const trimmed = noteDraft.trim()
      const nextNote = trimmed === '' ? undefined : trimmed
      if (nextNote !== variant.note) {
        onPatch({ note: nextNote })
      }
      setNoteDraft(null)
    }
  }
  const commitWeight = () => {
    if (weightDraft !== null) {
      const parsed = Number(weightDraft)
      if (weightDraft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
        const nextWeight = roundWeight(parsed)
        if (nextWeight !== weight) {
          onPatch({ weight: nextWeight })
        }
      } else {
        void haptics.reject()
      }
      setWeightDraft(null)
    }
  }

  return (
    <>
      <label className="ex-field">
        <span>Name</span>
        <input
          className="ws-editor-input"
          type="text"
          value={nameDraft ?? name}
          onFocus={() => setNameDraft(name)}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div className="ex-field">
        <span>Muscle group</span>
        <div className="ex-muscles">
          {CATEGORIES.map((cat) => {
            const selected = category === cat
            return (
              <button
                key={cat}
                type="button"
                className={`ex-muscle ${selected ? 'sel' : ''}`}
                style={selected ? { background: muscleColor(cat), borderColor: muscleColor(cat) } : undefined}
                onClick={() => {
                  if (!selected) {
                    onPatch({ category: cat })
                    void haptics.selection()
                  }
                }}
              >
                {categoryLabel(cat)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="ws-editor-row">
        <div className="ex-field">
          <span>Sets</span>
          <div className="set-stepper">
            <button
              type="button"
              aria-label="Decrease sets"
              {...holdStepper.bind(() => adjustSets(-1))}
            >
              <Icon name="minus" size={18} />
            </button>
            <strong>{sets}</strong>
            <button
              type="button"
              aria-label="Increase sets"
              {...holdStepper.bind(() => adjustSets(1))}
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <div className="ex-field">
          <span>Reps</span>
          <div className="set-stepper">
            <button
              type="button"
              aria-label="Decrease reps"
              {...holdStepper.bind(() => adjustReps(-1))}
            >
              <Icon name="minus" size={18} />
            </button>
            <strong>{reps}</strong>
            <button
              type="button"
              aria-label="Increase reps"
              {...holdStepper.bind(() => adjustReps(1))}
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
      </div>

      <label className="ex-field">
        <span>Setup</span>
        <input
          className="ws-editor-input"
          type="text"
          placeholder="Seat 4, 20°"
          value={setupDraft ?? setup}
          onFocus={() => setSetupDraft(setup)}
          onChange={(event) => setSetupDraft(event.target.value)}
          onBlur={commitSetup}
          onKeyDown={blurOnEnter}
        />
      </label>

      <label className="ex-field">
        <span>Note</span>
        <input
          className="ws-editor-input"
          type="text"
          placeholder="Grip felt off; go slower"
          value={noteDraft ?? (variant.note ?? '')}
          onFocus={() => setNoteDraft(variant.note ?? '')}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
          onKeyDown={blurOnEnter}
        />
      </label>

      <label className="ex-field">
        <span>Weight (kg)</span>
        <input
          className="ws-editor-input"
          type="number"
          inputMode="decimal"
          min={0}
          value={weightDraft ?? String(weight)}
          onFocus={() => setWeightDraft(String(weight))}
          onChange={(event) => setWeightDraft(event.target.value)}
          onBlur={commitWeight}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div className="ex-field">
        <span>Weight type</span>
        <div className="ex-segment" role="group" aria-label="Weight type">
          <button
            type="button"
            className={perHand ? '' : 'sel'}
            aria-pressed={!perHand}
            onClick={() => {
              if (perHand) {
                onPatch({ perHand: false })
                void haptics.selection()
              }
            }}
          >
            Total
          </button>
          <button
            type="button"
            className={perHand ? 'sel' : ''}
            aria-pressed={perHand}
            onClick={() => {
              if (!perHand) {
                onPatch({ perHand: true })
                void haptics.selection()
              }
            }}
          >
            Per hand
          </button>
        </div>
      </div>
    </>
  )
}

type EditableExerciseItemProps = {
  id: string
  variant: ExerciseVariant
  restSeconds: number
  hidden: boolean
  linkedPartnerName?: string
  isExpanded: boolean
  canRemove: boolean
  canLink: boolean
  onToggle: () => void
  onVariant: (patch: Partial<ExerciseVariant>) => void
  onRest: (value: number) => void
  onRemove: () => void
  onToggleHidden: () => void
  onLink: () => void
  onUnlink: () => void
}

// One exercise, in edit mode: a drag-sortable accordion whose expanded body is the inline editor.
// Exercises are independent rows (reorderable on their own). Each can be hidden from the workout, and
// linked to one other as a swap pair via the controls in its footer.
function EditableExerciseItem(props: EditableExerciseItemProps) {
  const { id, variant, restSeconds, hidden, linkedPartnerName, isExpanded, canRemove, canLink } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const restMinutes = Math.floor(restSeconds / 60)
  const restSecondsPart = restSeconds % 60
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [secDraft, setSecDraft] = useState<string | null>(null)
  const restSecondsRef = useRef(restSeconds)
  restSecondsRef.current = restSeconds
  const holdStepper = useHoldStepper()

  const adjustRest = (delta: number) => {
    const next = Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, restSecondsRef.current + delta))
    if (next === restSecondsRef.current) return false
    restSecondsRef.current = next
    props.onRest(next)
    return true
  }

  const muscle = muscleColor(variant.category)

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderColor: isExpanded ? `${muscle}b0` : `${muscle}52`,
    opacity: isDragging ? 0.75 : 1,
    zIndex: isDragging ? 5 : undefined,
    boxShadow: isDragging ? 'var(--shadow)' : undefined,
  }

  // Rest is edited as separate minutes and seconds windows but stored as one total in seconds.
  // Commit combines both (whichever isn't being edited falls back to the current value), then clamps
  // to 5s–10m so a stray entry can't produce an unusable timer.
  const commitRest = () => {
    if (minDraft === null && secDraft === null) {
      return
    }
    const mins = Number(minDraft ?? String(restMinutes))
    const secs = Number(secDraft ?? String(restSecondsPart))
    if (Number.isFinite(mins) && Number.isFinite(secs)) {
      const total = Math.max(0, Math.round(mins)) * 60 + Math.max(0, Math.round(secs))
      const nextRest = Math.min(600, Math.max(5, total))
      if (nextRest !== restSeconds) {
        props.onRest(nextRest)
      }
    } else {
      void haptics.reject()
    }
    setMinDraft(null)
    setSecDraft(null)
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      id={`exercise-${id}`}
      className={`ws-item editing${isExpanded ? ' open' : ''}${isDragging ? ' dragging' : ''}${hidden ? ' is-hidden' : ''}`}
    >
      <div className="ws-edit-head">
        <button className="ws-edit-handle" type="button" aria-label="Reorder exercise" {...attributes} {...listeners}>
          <Icon name="grip" size={18} />
        </button>
        <button className="ws-edit-open" type="button" aria-expanded={isExpanded} onClick={props.onToggle}>
          <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
          <span className="ws-edit-open-main">
            <strong>{variant.name}</strong>
            <small>
              {categoryLabel(variant.category)} · {variant.sets}×{variant.reps} · rest {formatTimer(restSeconds)}
              {linkedPartnerName && ` · ⇄ ${linkedPartnerName}`}
              {hidden && ' · hidden'}
            </small>
          </span>
          <Icon name={isExpanded ? 'up' : 'down'} size={18} />
        </button>
      </div>

      <div className="ws-item-body" aria-hidden={!isExpanded} inert={!isExpanded}>
        <div className="ws-item-body-inner">
          <div className="ws-editor">
            <VariantFields variant={variant} onPatch={props.onVariant} />

            <div className="ex-field ex-slot-rest">
              <span>Rest time</span>
              <div className="set-stepper rest-stepper">
                <button
                  type="button"
                  aria-label="Decrease rest time"
                  {...holdStepper.bind(() => adjustRest(-10))}
                >
                  <Icon name="minus" size={18} />
                </button>
                <div className="rest-mmss">
                  <label className="set-rest-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      aria-label="Rest minutes"
                      value={minDraft ?? String(restMinutes)}
                      onFocus={() => setMinDraft(String(restMinutes))}
                      onChange={(event) => setMinDraft(event.target.value)}
                      onBlur={commitRest}
                      onKeyDown={blurOnEnter}
                    />
                    <span>m</span>
                  </label>
                  <label className="set-rest-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      aria-label="Rest seconds"
                      value={secDraft ?? String(restSecondsPart)}
                      onFocus={() => setSecDraft(String(restSecondsPart))}
                      onChange={(event) => setSecDraft(event.target.value)}
                      onBlur={commitRest}
                      onKeyDown={blurOnEnter}
                    />
                    <span>s</span>
                  </label>
                </div>
                <button
                  type="button"
                  aria-label="Increase rest time"
                  {...holdStepper.bind(() => adjustRest(10))}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </div>

            <div className="ex-controls">
              <button className="ex-control-btn" type="button" onClick={props.onToggleHidden}>
                <Icon name={hidden ? 'eye' : 'eye-off'} size={16} />
                {hidden ? 'Show on workout' : 'Hide from workout'}
              </button>
              {linkedPartnerName ? (
                <div className="ex-linked">
                  <span className="ex-linked-label">
                    <Icon name="repeat" size={15} />
                    Linked to {linkedPartnerName}
                  </span>
                  <button className="ex-control-btn" type="button" onClick={props.onUnlink}>
                    Unlink
                  </button>
                </div>
              ) : (
                <button className="ex-control-btn" type="button" disabled={!canLink} onClick={props.onLink}>
                  <Icon name="repeat" size={15} />
                  Link another exercise
                </button>
              )}
            </div>

            <div className="ex-danger">
              <button className="ws-editor-remove" type="button" disabled={!canRemove} onClick={props.onRemove}>
                <Icon name="trash" size={18} />
                Delete exercise
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [data, setData] = useState<AppData>(loadData)
  templatesRef = data.templates
  const [screen, setScreenState] = useState<Screen>(loadScreen)
  const [screenStack, setScreenStack] = useState<Screen[]>([])
  const [weightDialog, setWeightDialog] = useState<WeightDialog | null>(null)
  const [previousDialog, setPreviousDialog] = useState<PreviousDialog | null>(null)
  const [linkDialog, setLinkDialog] = useState<LinkDialog | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncConflict, setSyncConflict] = useState<{ remote: CloudState; remoteUpdatedAt: number } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger?: boolean
    onConfirm: () => void
  } | null>(null)
  const [historyOptionsSessionId, setHistoryOptionsSessionId] = useState<string | null>(null)
  const [durationDialog, setDurationDialog] = useState<DurationDialog | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [cloudActionBusy, setCloudActionBusy] = useState(false)
  const [cloudActionError, setCloudActionError] = useState('')
  const [authDialog, setAuthDialog] = useState<AuthDialog | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [apkDialogOpen, setApkDialogOpen] = useState(false)
  const [passDialogOpen, setPassDialogOpen] = useState(false)
  const [passError, setPassError] = useState('')
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [passwordDialog, setPasswordDialog] = useState<PasswordDialog | null>(null)
  // When this device last completed a successful sync — shown on the home account row.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const stored = Number(getStored(LAST_SYNCED_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  })
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS)
  // Length the running countdown started from — drives the dock's drain bar. Kept separately from
  // the active exercise's rest so tapping another exercise mid-rest doesn't skew the bar.
  const [restDuration, setRestDuration] = useState(DEFAULT_REST_SECONDS)
  const [restRunning, setRestRunning] = useState(false)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restPulse, setRestPulse] = useState(false)
  const [restNotificationMessage, setRestNotificationMessage] = useState('')
  const [vibrationMessage, setVibrationMessage] = useState('')
  // Inline result note for the Export/Import backup rows (shown in place of the row subtitle, like
  // the Test vibration row) — the app never uses browser alert/confirm popups.
  const [backupMessage, setBackupMessage] = useState<{ target: 'export' | 'import'; text: string; error?: boolean } | null>(null)
  const [latestApk, setLatestApk] = useState<LatestApk | null>(null)
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateUiState>({ status: 'checking', progress: 0 })
  // The build number of the installed APK (native only; CI stamps it into versionCode). Null on the
  // web and on APKs older than the stamping change — those can't tell which build they are.
  const [installedBuild, setInstalledBuild] = useState<number | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [highlightSession, setHighlightSession] = useState<string | null>(null)
  const scrollTimer = useRef<number | null>(null)
  const pulseTimer = useRef<number | null>(null)
  const restAlertStartedRef = useRef(false)
  const syncTimer = useRef<number | null>(null)
  const manualSyncPendingRef = useRef(false)
  const scrollPositionsRef = useRef(data.scrollBySession)
  scrollPositionsRef.current = data.scrollBySession
  const expandedRef = useRef<string | null>(null)
  const holdStepper = useHoldStepper()
  // Mirror the current screen into a ref so the (mount-only) popstate handler can read it.
  const screenRef = useRef(screen)
  screenRef.current = screen
  // Dismissable "back layers" stacked on top of a screen: edit mode and any open dialog. The back
  // gesture closes the topmost one before leaving the screen. We mirror their open-state into refs
  // and a count so the mount-only history handler can read the latest values.
  const dialogOpen =
    weightDialog !== null ||
    previousDialog !== null ||
    linkDialog !== null ||
    authDialog !== null ||
    passwordDialog !== null ||
    accountDialogOpen ||
    apkDialogOpen ||
    passDialogOpen ||
    aboutDialogOpen ||
    confirmDialog !== null ||
    historyOptionsSessionId !== null ||
    durationDialog !== null ||
    syncConflict !== null ||
    startDialogOpen
  const overlayCount = (editMode ? 1 : 0) + (dialogOpen ? 1 : 0)
  const editModeRef = useRef(editMode)
  editModeRef.current = editMode
  const editDirtyRef = useRef(editDirty)
  editDirtyRef.current = editDirty
  // Pre-edit snapshot of the routine + sessions, so discarding edit mode can roll them back.
  const editSnapshotRef = useRef<{ templates: WorkoutTemplate[]; sessions: WorkoutSession[] } | null>(null)
  const dialogOpenRef = useRef(dialogOpen)
  dialogOpenRef.current = dialogOpen
  const syncConflictRef = useRef(syncConflict)
  syncConflictRef.current = syncConflict
  const overlayBuffersRef = useRef(0)
  const closingOverlayViaPopstateRef = useRef(false)
  const ignorePopstateRef = useRef(0)
  const dataRef = useRef(data)
  dataRef.current = data
  const cloudUserRef = useRef(cloudUser)
  cloudUserRef.current = cloudUser
  const lastPersistedDataRef = useRef(data)
  const applyingRemoteTimestampRef = useRef<number | null>(null)
  const syncReadyRef = useRef(false)
  const queueCloudPushRef = useRef<() => void>(() => undefined)
  const [initialSyncTimestamp] = useState(() => {
    const initialData = buildInitialData()
    return initialLocalTimestamp(
      getStored(LOCAL_UPDATED_KEY),
      hasMeaningfulLocalData(data, initialData),
      Date.now(),
    )
  })
  const localUpdatedAtRef = useRef(initialSyncTimestamp)

  // Record a completed sync (push or pull) for the "last synced" label on the account row.
  const markSynced = () => {
    const now = Date.now()
    setLastSyncedAt(now)
    setStored(LAST_SYNCED_KEY, String(now))
  }

  const finishManualSync = (success: boolean) => {
    if (!manualSyncPendingRef.current) {
      return false
    }
    manualSyncPendingRef.current = false
    void (success ? haptics.confirm() : haptics.reject())
    return true
  }

  queueCloudPushRef.current = () => {
    const user = cloudUserRef.current
    if (!supabase || !user || !syncReadyRef.current) {
      return
    }

    if (syncTimer.current !== null) {
      window.clearTimeout(syncTimer.current)
    }

    setSyncStatus('syncing')
    setSyncError('')
    syncTimer.current = window.setTimeout(async () => {
      const activeUser = cloudUserRef.current
      if (!activeUser || activeUser.id !== user.id || !syncReadyRef.current) {
        return
      }

      const payload = dataRef.current
      const pushedAt = localUpdatedAtRef.current
      try {
        await saveCloudState(user.id, payload, pushedAt)
        if (cloudUserRef.current?.id !== user.id) {
          return
        }

        markSynced()
        finishManualSync(true)
        if (localUpdatedAtRef.current > pushedAt) {
          queueCloudPushRef.current()
        } else {
          setSyncStatus('synced')
        }
      } catch (error) {
        if (cloudUserRef.current?.id === user.id) {
          setSyncStatus('error')
          setSyncError(errorMessage(error))
        }
        if (!finishManualSync(false)) {
          void haptics.reject()
        }
      }
    }, SYNC_DEBOUNCE_MS)
  }

  // Inline Settings notes (vibration test, backup results) clear themselves after a few seconds, so
  // the rows return to their normal descriptions without needing a dismiss control.
  useEffect(() => {
    if (!vibrationMessage) {
      return
    }
    const id = window.setTimeout(() => setVibrationMessage(''), 5000)
    return () => window.clearTimeout(id)
  }, [vibrationMessage])

  useEffect(() => {
    if (!backupMessage) {
      return
    }
    const id = window.setTimeout(() => setBackupMessage(null), 5000)
    return () => window.clearTimeout(id)
  }, [backupMessage])

  // The native splash stays up (launchAutoHide: false) until the real UI has mounted, so launch is
  // logo-on-background the whole way. Old APKs without the plugin reject the call — ignored.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    let active = true
    void fetchLatestApk().then((latest) => {
      if (active && latest) {
        setLatestApk(latest)
      }
    })
    // Inside the native app, read the installed APK's stamped build number so the home row can say
    // whether the latest release is actually newer. Builds ≤ 1 predate the stamping and are unknown.
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.getInfo()
        .then((info) => {
          const build = Number(info.build)
          if (active && Number.isFinite(build) && build > 1) {
            setInstalledBuild(build)
          }
        })
        .catch(() => undefined)
    }
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!apkDialogOpen || !Capacitor.isNativePlatform()) {
      return
    }
    let active = true
    let unsupported = false
    const poll = async () => {
      if (unsupported) return
      try {
        const state = await AppUpdater.getStatus()
        if (active) setAppUpdateState(state)
      } catch {
        unsupported = true
        if (active) setAppUpdateState({ status: 'unsupported', progress: 0 })
      }
    }
    void poll()
    const intervalId = window.setInterval(() => void poll(), 750)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [apkDialogOpen])

  useEffect(() => {
    setStored(STORAGE_KEY, JSON.stringify(data))

    const previous = lastPersistedDataRef.current
    if (previous === data) {
      return
    }
    lastPersistedDataRef.current = data

    const remoteTimestamp = applyingRemoteTimestampRef.current
    if (remoteTimestamp !== null) {
      applyingRemoteTimestampRef.current = null
      localUpdatedAtRef.current = remoteTimestamp
      setStored(LOCAL_UPDATED_KEY, String(remoteTimestamp))
      return
    }

    // Pure UI bookkeeping (scroll position, expanded exercise) persists locally above but must not
    // advance the sync timestamp or upload — see isMeaningfulChange for why.
    if (!isMeaningfulChange(previous, data)) {
      return
    }

    const updatedAt = nextLocalTimestamp(localUpdatedAtRef.current, Date.now())
    localUpdatedAtRef.current = updatedAt
    setStored(LOCAL_UPDATED_KEY, String(updatedAt))
    queueCloudPushRef.current()
  }, [data])

  useEffect(() => {
    if (localUpdatedAtRef.current > 0 && !getStored(LOCAL_UPDATED_KEY)) {
      setStored(LOCAL_UPDATED_KEY, String(localUpdatedAtRef.current))
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      return
    }
    let active = true
    const updateCloudUser = (user: { id: string; email?: string | null } | undefined) => {
      setCloudUser(user ? { id: user.id, email: user.email ?? 'Unknown email' } : null)
    }

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (active) {
        updateCloudUser(sessionData.session?.user)
      }
    })
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      updateCloudUser(session?.user)
      // Arriving via a password-reset email link: Supabase signs the user in with a recovery
      // session and fires this event — prompt straight away for the new password.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordDialog({ mode: 'recovery', value: '', error: '', busy: false })
      }
    })
    return () => {
      active = false
      authSub.subscription.unsubscribe()
    }
  }, [])

  const cloudUserId = cloudUser?.id
  useEffect(() => {
    syncReadyRef.current = false
    if (syncTimer.current !== null) {
      window.clearTimeout(syncTimer.current)
      syncTimer.current = null
    }

    if (!cloudUserId || !supabase) {
      setSyncStatus('idle')
      setSyncError('')
      setSyncConflict(null)
      return
    }

    let cancelled = false
    setSyncStatus('checking')
    setSyncError('')
    setSyncConflict(null)

    const syncOnSignIn = async () => {
      try {
        const remote = await loadCloudState(cloudUserId)
        if (cancelled) {
          return
        }

        const remoteUpdatedAt = remote ? parseCloudTimestamp(remote.updatedAt) : null
        if (remote && remoteUpdatedAt === null) {
          throw new Error('Cloud data has an invalid timestamp. Local data was not changed.')
        }

        // First sign-in to an account that already holds data, while this device has its own
        // unsynced changes (it was never synced with this account): don't silently overwrite either
        // side — let the user choose. Continuations (this device already synced this account) and
        // non-meaningful local data fall through to the normal last-write-wins below.
        const syncedAccount = getStored(SYNCED_ACCOUNT_KEY)
        const localMeaningful = hasMeaningfulLocalData(dataRef.current, buildInitialData())
        if (remote && remoteUpdatedAt !== null && localMeaningful && syncedAccount !== cloudUserId) {
          if (!isValidBackup(remote.data)) {
            throw new Error('Cloud data is invalid. Local data was not changed.')
          }
          setSyncConflict({ remote, remoteUpdatedAt })
          setSyncStatus('conflict')
          manualSyncPendingRef.current = false
          return
        }

        const localUpdatedAt = localUpdatedAtRef.current
        if (remote && remoteUpdatedAt !== null && chooseSyncDirection(remoteUpdatedAt, localUpdatedAt) === 'pull') {
          if (!isValidBackup(remote.data)) {
            throw new Error('Cloud data is invalid. Local data was not changed.')
          }

          applyingRemoteTimestampRef.current = remoteUpdatedAt
          localUpdatedAtRef.current = remoteUpdatedAt
          setStored(LOCAL_UPDATED_KEY, String(remoteUpdatedAt))
          setStored(SYNCED_ACCOUNT_KEY, cloudUserId)
          syncReadyRef.current = true
          setData(normalizeData(remote.data))
          setSyncStatus('synced')
          markSynced()
          finishManualSync(true)
          return
        }

        const pushedAt = Math.max(localUpdatedAt, Date.now())
        localUpdatedAtRef.current = pushedAt
        setStored(LOCAL_UPDATED_KEY, String(pushedAt))
        await saveCloudState(cloudUserId, dataRef.current, pushedAt)
        if (cancelled) {
          return
        }

        setStored(SYNCED_ACCOUNT_KEY, cloudUserId)
        syncReadyRef.current = true
        markSynced()
        finishManualSync(true)
        if (localUpdatedAtRef.current > pushedAt) {
          queueCloudPushRef.current()
        } else {
          setSyncStatus('synced')
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus('error')
          setSyncError(errorMessage(error))
          if (!finishManualSync(false)) {
            void haptics.reject()
          }
        }
      }
    }

    void syncOnSignIn()
    return () => {
      cancelled = true
    }
  }, [cloudUserId, syncAttempt])

  useEffect(() => {
    if (!supabase) {
      return
    }
    const handleOnline = () => {
      if (!cloudUserRef.current) {
        return
      }
      if (syncReadyRef.current) {
        queueCloudPushRef.current()
      } else {
        setSyncAttempt((current) => current + 1)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  useEffect(() => {
    window.history.replaceState({ fitnessHub: true }, '')

    const handlePopState = () => {
      // History entries consumed by the overlay sync effect (closing a dialog/edit mode via a
      // Cancel/Done tap) must not also pop a screen — skip them.
      if (ignorePopstateRef.current > 0) {
        ignorePopstateRef.current -= 1
        return
      }

      // A back layer (open dialog, then edit mode) is dismissed before the screen changes.
      if (overlayBuffersRef.current > 0) {
        closingOverlayViaPopstateRef.current = true
        if (dialogOpenRef.current) {
          closeAllDialogs()
        } else if (editModeRef.current) {
          // Leaving edit mode via the cross / back gesture. If changes were made, keep edit mode open
          // (restore the consumed history entry) and show a styled confirm on top; otherwise exit.
          if (editDirtyRef.current) {
            closingOverlayViaPopstateRef.current = false
            window.history.pushState({ fitnessHub: true, overlay: true }, '')
            setConfirmDialog({
              title: 'Discard changes?',
              message: 'Your workout edits will be lost.',
              confirmLabel: 'Discard',
              danger: true,
              onConfirm: () => {
                if (editSnapshotRef.current) {
                  const snapshot = editSnapshotRef.current
                  setData((current) => ({ ...current, templates: snapshot.templates, sessions: snapshot.sessions }))
                }
                setEditMode(false)
                setConfirmDialog(null)
              },
            })
            return
          }
          setEditMode(false)
        }
        return
      }

      setScreenStack((currentStack) => {
        if (currentStack.length > 0) {
          const previous = currentStack[currentStack.length - 1]
          setScreenState(previous)
          return currentStack.slice(0, -1)
        }

        // Empty stack: only the main menu lets the back press exit the app. From anywhere else,
        // fall back to the menu (and keep a history entry to consume) rather than exiting.
        if (screenRef.current.name !== 'main') {
          window.history.pushState({ fitnessHub: true }, '')
          setScreenState({ name: 'main' })
        }
        return currentStack
      })
    }

    window.addEventListener('popstate', handlePopState)

    // On Android, Capacitor's hardware/gesture back does NOT navigate web history by default — it
    // just exits the app. Handle it explicitly: step back through history (which fires the popstate
    // handler above to close a dialog/edit layer or return to the menu); only the bare menu exits.
    let removeBackButton: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('backButton', () => {
        if (overlayBuffersRef.current > 0 || screenRef.current.name !== 'main') {
          window.history.back()
        } else {
          void CapacitorApp.exitApp()
        }
      }).then((handle) => {
        removeBackButton = () => void handle.remove()
      })
    }

    return () => {
      window.removeEventListener('popstate', handlePopState)
      removeBackButton?.()
    }
  }, [])

  // Keep the browser history in sync with the open back layers (edit mode / dialogs). Opening a
  // layer pushes a history entry so the back gesture has something to consume; closing one via the
  // UI (Cancel/Done) steps that entry back off so the history stays aligned with what's on screen.
  useEffect(() => {
    const pushed = overlayBuffersRef.current
    if (overlayCount > pushed) {
      for (let i = pushed; i < overlayCount; i += 1) {
        window.history.pushState({ fitnessHub: true, overlay: true }, '')
      }
      overlayBuffersRef.current = overlayCount
      return
    }
    if (overlayCount < pushed) {
      const toConsume = pushed - overlayCount
      overlayBuffersRef.current = overlayCount
      if (closingOverlayViaPopstateRef.current) {
        // The back gesture already removed the entry; just clear the flag.
        closingOverlayViaPopstateRef.current = false
      } else {
        // Closed via the UI: remove the matching history entries ourselves.
        ignorePopstateRef.current += toConsume
        for (let i = 0; i < toConsume; i += 1) {
          window.history.back()
        }
      }
    }
  }, [overlayCount])

  useEffect(() => {
    if (!restRunning || restEndsAt === null) {
      return
    }

    const updateTimer = () => {
      const remaining = restSecondsRemaining(restEndsAt, Date.now())
      if (remaining <= 3 && !restAlertStartedRef.current) {
        restAlertStartedRef.current = true
        void haptics.timerFinished()
      }
      if (remaining === 0) {
        setRestRunning(false)
        setRestEndsAt(null)
        setRestSeconds(data.restSeconds)
        triggerRestDone()
        return
      }
      setRestSeconds(remaining)
    }

    updateTimer()
    const intervalId = window.setInterval(updateTimer, 1000)

    return () => window.clearInterval(intervalId)
  }, [data.restSeconds, restEndsAt, restRunning])

  useEffect(() => {
    if (screen.name !== 'session') {
      return
    }

    const savedY = scrollPositionsRef.current[screen.sessionId] ?? 0
    const restoreId = window.setTimeout(() => window.scrollTo({ top: savedY }), 0)

    const saveScroll = () => {
      if (scrollTimer.current !== null) {
        window.clearTimeout(scrollTimer.current)
      }

      scrollTimer.current = window.setTimeout(() => {
        const y = Math.round(window.scrollY)
        setData((current) => ({
          ...current,
          scrollBySession: {
            ...current.scrollBySession,
            [screen.sessionId]: y,
          },
        }))
      }, 300)
    }

    window.addEventListener('scroll', saveScroll, { passive: true })

    return () => {
      window.clearTimeout(restoreId)
      window.removeEventListener('scroll', saveScroll)
      if (scrollTimer.current !== null) {
        window.clearTimeout(scrollTimer.current)
      }
    }
  }, [screen])

  // Smoothly bring the active exercise into view when it changes — e.g. after Done/Failed
  // auto-advances to the next pending exercise, or when expanding a different one. Skips the first
  // run per session so it doesn't fight the saved-scroll restore on entry.
  useEffect(() => {
    if (screen.name !== 'session') {
      expandedRef.current = null
      return
    }
    const expanded = data.expandedBySession[screen.sessionId] ?? null
    const previous = expandedRef.current
    expandedRef.current = expanded
    if (expanded && previous !== null && previous !== expanded) {
      // Wait for the expand/collapse height animation to settle, then scroll only if the item isn't
      // already on screen (block:'nearest'). 'center' moved the view on every tap — even when the
      // item was visible — and fought the growing card, which read as jitter on a near-fitting list.
      const id = window.setTimeout(() => {
        document.getElementById(`exercise-${expanded}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 210)
      return () => window.clearTimeout(id)
    }
  }, [data.expandedBySession, screen])

  useEffect(() => {
    return () => {
      if (pulseTimer.current !== null) {
        window.clearTimeout(pulseTimer.current)
      }
      if (syncTimer.current !== null) {
        window.clearTimeout(syncTimer.current)
      }
    }
  }, [])

  const sortedSessions = useMemo(
    () => [...data.sessions].sort((a, b) => b.createdAt - a.createdAt),
    [data.sessions],
  )
  const historyOptionsSession = historyOptionsSessionId
    ? data.sessions.find((session) => session.id === historyOptionsSessionId) ?? null
    : null

  // Drag-to-reorder in edit mode: press-and-hold to start (the standard mobile reorder gesture), so
  // the interaction is consistent — every drag begins the same way and fires one haptic at drag
  // start (see onDragStart). A quick flick no longer slips straight into a drag. Keyboard supported.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderGroups = (workoutId: WorkoutId, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const workout = data.templates.find((template) => template.id === workoutId)
    const oldIndex = workout?.groups.findIndex((group) => group.id === active.id) ?? -1
    const newIndex = workout?.groups.findIndex((group) => group.id === over.id) ?? -1
    if (oldIndex < 0 || newIndex < 0) {
      return
    }
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== workoutId) {
          return template
        }
        return { ...template, groups: arrayMove(template.groups, oldIndex, newIndex) }
      }),
    }))
    void haptics.dragDrop()
  }

  // Cancel the "choose which data to keep" prompt: undo the sign-in attempt entirely by signing out,
  // so the app returns to exactly the state it was in before this account was tried. Local data is
  // never touched by the conflict flow, so nothing is lost.
  const cancelSyncConflict = async () => {
    manualSyncPendingRef.current = false
    setSyncConflict(null)
    setSyncStatus('idle')
    setSyncError('')
    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined)
    }
    setCloudUser(null)
  }

  const resolveSyncConflict = async (keep: 'account' | 'device') => {
    const conflict = syncConflict
    const userId = cloudUserId
    if (!conflict || !userId) {
      return
    }
    setSyncConflict(null)
    setSyncStatus('checking')
    setSyncError('')
    try {
      setStored(SYNCED_ACCOUNT_KEY, userId)
      if (keep === 'account') {
        applyingRemoteTimestampRef.current = conflict.remoteUpdatedAt
        localUpdatedAtRef.current = conflict.remoteUpdatedAt
        setStored(LOCAL_UPDATED_KEY, String(conflict.remoteUpdatedAt))
        syncReadyRef.current = true
        setData(normalizeData(conflict.remote.data))
        setSyncStatus('synced')
        markSynced()
        void haptics.confirm()
      } else {
        const pushedAt = Math.max(localUpdatedAtRef.current, Date.now())
        localUpdatedAtRef.current = pushedAt
        setStored(LOCAL_UPDATED_KEY, String(pushedAt))
        await saveCloudState(userId, dataRef.current, pushedAt)
        syncReadyRef.current = true
        setSyncStatus('synced')
        markSynced()
        void haptics.confirm()
      }
    } catch (error) {
      setSyncStatus('error')
      setSyncError(errorMessage(error))
      void haptics.reject()
    }
  }

  const navigate = (nextScreen: Screen) => {
    setScreenStack((currentStack) => [...currentStack, screen])
    setScreenState(nextScreen)
    window.history.pushState({ fitnessHub: true }, '')
  }

  const goBack = (fallback: Screen) => {
    // Drive the in-app back button through browser history so it behaves identically to the
    // Android back gesture / browser back: history.back() fires popstate, which pops the stack.
    // This keeps the navigation stack and the history stack in sync (the previous split path
    // let them drift, which made the back gesture stop working).
    if (screenStack.length > 0) {
      window.history.back()
    } else {
      setScreenState(fallback)
    }
  }

  const closeAllDialogs = () => {
    setWeightDialog(null)
    setPreviousDialog(null)
    setLinkDialog(null)
    setAuthDialog(null)
    setPasswordDialog(null)
    setAccountDialogOpen(false)
    setApkDialogOpen(false)
    setPassDialogOpen(false)
    setAboutDialogOpen(false)
    setStartDialogOpen(false)
    setConfirmDialog(null)
    setHistoryOptionsSessionId(null)
    setDurationDialog(null)
    if (syncConflictRef.current) {
      setSyncConflict(null)
      setSyncStatus('idle')
      setSyncError('')
      if (supabase) {
        void supabase.auth.signOut().catch(() => undefined)
      }
      setCloudUser(null)
    }
  }

  const scrollToSession = (sessionId: string) => {
    const card = document.getElementById(`hist-${sessionId}`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightSession(sessionId)
    window.setTimeout(() => {
      setHighlightSession((current) => (current === sessionId ? null : current))
    }, 1800)
  }

  const openDurationEditor = (session: WorkoutSession) => {
    if (session.finishedAt === undefined || session.finishedAt <= session.createdAt) return
    const totalMinutes = Math.max(1, Math.round((session.finishedAt - session.createdAt) / 60000))
    setHistoryOptionsSessionId(null)
    setDurationDialog({
      sessionId: session.id,
      hours: String(Math.floor(totalMinutes / 60)),
      minutes: String(totalMinutes % 60),
      error: '',
    })
  }

  const saveDuration = () => {
    if (!durationDialog) return
    const hours = Number(durationDialog.hours)
    const minutes = Number(durationDialog.minutes)
    const totalMinutes = workoutDurationMinutes(hours, minutes)
    if (totalMinutes === null) {
      setDurationDialog({ ...durationDialog, error: 'Enter a duration from 1 minute to 23 hours 59 minutes.' })
      void haptics.reject()
      return
    }
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === durationDialog.sessionId
          ? { ...session, finishedAt: session.createdAt + totalMinutes * 60000 }
          : session,
      ),
    }))
    setDurationDialog(null)
    void haptics.confirm()
  }

  // Schedule (or reschedule) the native locked-screen alarm for the given end time, surfacing the
  // outdated-APK / failure states under the dock. Shared by starting and extending the rest timer.
  const startRestAlarm = (endsAt: number) => {
    setRestNotificationMessage('')
    void scheduleRestNotification(endsAt).then((result) => {
      if (result.status === 'outdated') {
        setRestNotificationMessage(
          'Update the Android app for locked-screen rest alerts. The timer still works.',
        )
        void haptics.reject()
      } else if (result.status === 'failed') {
        if (result.detail) {
          console.warn('Rest alarm failed:', result.detail)
        }
        setRestNotificationMessage('Locked-screen rest alert unavailable. The timer still works.')
        void haptics.reject()
      }
    })
  }

  // "+10s" while resting: push the end time out without restarting, and re-arm the native alarm.
  const extendRest = () => {
    if (!restRunning || restEndsAt === null) {
      return
    }
    const endsAt = restEndsAt + 10_000
    restAlertStartedRef.current = false
    haptics.cancelTimerAlert()
    setRestEndsAt(endsAt)
    setRestSeconds(restSecondsRemaining(endsAt, Date.now()))
    setRestDuration((current) => current + 10)
    void haptics.selection()
    startRestAlarm(endsAt)
  }

  const triggerRestDone = () => {
    setRestPulse(true)

    if (pulseTimer.current !== null) {
      window.clearTimeout(pulseTimer.current)
    }

    pulseTimer.current = window.setTimeout(() => setRestPulse(false), 1100)
  }

  // Version facts shared by the Android tile and its dialog. `updateAvailable`/`upToDate` can only
  // be decided inside the native app on a build-stamped APK; everywhere else they stay false.
  const apkStatus = () => {
    const native = Capacitor.isNativePlatform()
    const build = latestApk?.build ?? null
    const released = latestApk?.publishedAt != null ? formatRelative(latestApk.publishedAt) : null
    return {
      native,
      build,
      released,
      updateAvailable: native && build !== null && installedBuild !== null && build > installedBuild,
      upToDate: native && build !== null && installedBuild !== null && build <= installedBuild,
    }
  }

  const startAppUpdate = async () => {
    setAppUpdateState({ status: 'downloading', progress: 0 })
    try {
      const state = await AppUpdater.download({ url: APK_DOWNLOAD_URL })
      setAppUpdateState(state)
      if (state.status === 'downloading' || state.status === 'ready') {
        void haptics.confirm()
      } else {
        void haptics.reject()
      }
    } catch {
      setAppUpdateState({ status: 'failed', progress: 0, detail: 'Could not start the download.' })
      void haptics.reject()
    }
  }

  const installAppUpdate = async () => {
    try {
      const state = await AppUpdater.install()
      setAppUpdateState(state)
      if (state.status === 'installing') {
        void haptics.confirm()
      } else if (state.status === 'failed' || state.status === 'permission-required') {
        void haptics.reject()
      }
    } catch {
      setAppUpdateState({ status: 'failed', progress: 100, detail: 'Could not open the installer.' })
      void haptics.reject()
    }
  }

  // The Android app tile — same size and styling as the other tiles. It opens an explainer dialog
  // (what the app is, version status, download button) rather than downloading straight away. The
  // subtitle mirrors the account tile: a status dot when the state is known.
  const renderApkTile = () => {
    const { native, build, updateAvailable, upToDate } = apkStatus()

    return (
      <button className={`home-tile${updateAvailable ? ' update' : ''}`} type="button" onClick={() => setApkDialogOpen(true)}>
        <span className="home-tile-icon"><Icon name="download" size={22} /></span>
        <span className="home-tile-text">
          <span>Android app</span>
          {updateAvailable ? (
            <small className="home-tile-status">
              <span className="sync-status update">
                <i aria-hidden="true" />
                Update available
              </span>
            </small>
          ) : upToDate ? (
            <small className="home-tile-status">
              <span className="sync-status synced">
                <i aria-hidden="true" />
                Up to date
              </span>
            </small>
          ) : (
            <small>{native ? 'Version unknown' : build !== null ? `Build ${build} available` : 'Download'}</small>
          )}
        </span>
      </button>
    )
  }

  const renderMain = () => {
    const latest = sortedSessions[0]
    const resumable = latest && !isSessionFinished(latest) ? latest : undefined
    const lastWorkoutId = latest?.workoutId
    const suggestedId: WorkoutId = lastWorkoutId === 'workout-a' ? 'workout-b' : 'workout-a'
    const otherWorkouts = data.templates.filter((template) => template.id !== suggestedId)
    const sessionCount = data.sessions.length

    return (
      <main className="home" aria-label="Fitness Hub">
        <header className="home-top">
          <h1>Fitness Hub</h1>
          <p className="home-sub">{formatMenuDate()}</p>
        </header>

        {resumable && (
          <button
            className="home-resume"
            type="button"
            onClick={() => openSession(resumable.workoutId, resumable.id)}
          >
            <span className="home-resume-row">
              <strong>Resume workout</strong>
              <Icon name="play" size={24} />
            </span>
            <span className="home-resume-sub">
              {getWorkout(resumable.workoutId).name} · {countDone(resumable)} of{' '}
              {displayedGroups(getWorkout(resumable.workoutId).groups).length} done
            </span>
            <span className="home-rail" aria-hidden="true">
              {displayedGroups(getWorkout(resumable.workoutId).groups).map(({ group }) => {
                const groupEntry = resumable.groupEntries[group.id]
                const result = groupEntry?.entries[group.activeVariantId]?.result
                return <i className={result === 'success' ? 'done' : result === 'failure' ? 'failed' : ''} key={group.id} />
              })}
            </span>
          </button>
        )}

        <button className="home-start-primary" type="button" onClick={() => setStartDialogOpen(true)}>
          <span className="home-start-main">
            <strong>Start workout</strong>
            <small>Up next · {getWorkout(suggestedId).name}</small>
          </span>
          <Icon name="forward" size={24} />
        </button>

        <div className="home-tiles">
          <button className="home-tile" type="button" onClick={() => navigate({ name: 'global-history' })}>
            <span className="home-tile-icon"><Icon name="history" size={22} /></span>
            <span className="home-tile-text">
              <span>History</span>
              <small>{sessionCount} {sessionCount === 1 ? 'workout' : 'workouts'}</small>
            </span>
          </button>
          <button
            className="home-tile"
            type="button"
            onClick={() => {
              setPassError('')
              setPassDialogOpen(true)
            }}
          >
            <span className="home-tile-icon"><Icon name="qr" size={22} /></span>
            <span className="home-tile-text">
              <span>Gym pass</span>
              <small>{data.gymPass ? 'Show QR code' : 'Add QR code'}</small>
            </span>
          </button>

          {supabase &&
            (cloudUser ? (
              <button className="home-tile" type="button" onClick={() => setAccountDialogOpen(true)}>
                <span className="home-tile-icon"><Icon name="cloud" size={22} /></span>
                <span className="home-tile-text">
                  <span>Account</span>
                  <small className="home-tile-status">
                    <span className={`sync-status ${syncStatus}`}>
                      <i aria-hidden="true" />
                      {syncStatusLabel(syncStatus)}
                    </span>
                  </small>
                </span>
              </button>
            ) : (
              <button
                className="home-tile"
                type="button"
                onClick={() => setAuthDialog({ mode: 'in', email: '', password: '', error: '', note: '', busy: false })}
              >
                <span className="home-tile-icon"><Icon name="cloud" size={22} /></span>
                <span className="home-tile-text">
                  <span>Sign in</span>
                  <small>Sync across devices</small>
                </span>
              </button>
            ))}

          {renderApkTile()}

          <button className="home-tile" type="button" onClick={() => navigate({ name: 'settings' })}>
            <span className="home-tile-icon"><Icon name="settings" size={22} /></span>
            <span className="home-tile-text">
              <span>Settings</span>
              <small>Backups and reset</small>
            </span>
          </button>

          <button className="home-tile" type="button" onClick={() => setAboutDialogOpen(true)}>
            <span className="home-tile-icon"><Icon name="info" size={22} /></span>
            <span className="home-tile-text">
              <span>About</span>
              <small>App details</small>
            </span>
          </button>
        </div>

        {startDialogOpen && (
          <Dialog title="Start workout">
            <div className="start-sheet">
              <button
                className="start-next"
                type="button"
                onClick={() => {
                  setStartDialogOpen(false)
                  startSession(suggestedId)
                }}
              >
                <span className="start-next-main">
                  <small>Up next</small>
                  <strong>{getWorkout(suggestedId).name}</strong>
                </span>
                <Icon name="play" size={22} />
              </button>

              {otherWorkouts.length > 0 && (
                <>
                  <p className="start-or">Other workouts</p>
                  {otherWorkouts.map((workout) => (
                    <button
                      key={workout.id}
                      className="start-other"
                      type="button"
                      onClick={() => {
                        setStartDialogOpen(false)
                        startSession(workout.id)
                      }}
                    >
                      <span>{workout.name}</span>
                      <Icon name="forward" size={18} />
                    </button>
                  ))}
                </>
              )}

              <button className="choice-cancel" type="button" onClick={() => setStartDialogOpen(false)}>
                Cancel
              </button>
            </div>
          </Dialog>
        )}
      </main>
    )
  }

  const renderHistory = (sessions: WorkoutSession[], onBack: () => void, title = 'History') => {
    const tracker = buildTrackerDays(sessions)
    // Headline stats over all recorded sessions (the list is sorted newest-first).
    const totalCount = sessions.length
    const finishedCount = sessions.filter(isSessionFinished).length
    const completionRate = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0
    const oldest = sessions[sessions.length - 1]
    const spanWeeks = oldest ? Math.max(1, (Date.now() - oldest.createdAt) / (7 * 24 * 60 * 60 * 1000)) : 1
    const perWeek = (totalCount / spanWeeks).toFixed(1)
    const durations = sessions
      .filter((session) => session.finishedAt !== undefined && session.finishedAt > session.createdAt)
      .map((session) => (session.finishedAt as number) - session.createdAt)
    const avgLength =
      durations.length > 0 ? formatDuration(durations.reduce((sum, value) => sum + value, 0) / durations.length) : '—'

    return (
      <Page title={title} onBack={onBack}>
        {sessions.length === 0 ? (
          <EmptyState text="No workouts yet." />
        ) : (
          <>
            <div className="hist-stats" aria-label="Workout stats">
              <div className="hist-stat">
                <strong>{totalCount}</strong>
                <span>Workouts</span>
              </div>
              <div className="hist-stat">
                <strong className="good">{completionRate}%</strong>
                <span>Completed</span>
              </div>
              <div className="hist-stat">
                <strong>{perWeek}</strong>
                <span>Per week</span>
              </div>
              <div className="hist-stat">
                <strong>{avgLength}</strong>
                <span>Avg duration</span>
              </div>
            </div>

            <div className="hist-tracker" aria-label="Last 28 days">
              <div className="hist-tracker-row">
                {tracker.map((day) => {
                  const latest = day.sessions[0]
                  const label = day.sessions.length
                    ? `${day.label} · ${day.sessions.map((s) => (s.status === 'done' ? 'finished' : 'unfinished')).join(', ')}`
                    : `${day.label} · no workout`
                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={`hist-day ${day.sessions.length ? 'has' : 'empty'}`}
                      disabled={!latest}
                      aria-label={label}
                      title={label}
                      onClick={() => latest && scrollToSession(latest.sessionId)}
                    >
                      {day.sessions.map((session, index) => (
                        <i className={`hist-seg ${session.status}`} key={index} />
                      ))}
                    </button>
                  )
                })}
              </div>
              <div className="hist-tracker-legend">
                <span><i className="dot done" />Completed</span>
                <span><i className="dot unfinished" />Unfinished</span>
                <span className="hist-tracker-ends">last 28 days</span>
              </div>
            </div>

            <div className="hist-list">
              {sessions.map((session) => {
                const workout = getWorkout(session.workoutId)
                const doneCount = countDone(session)
                // Count displayed slots (linked pairs collapse, hidden drop) — same base as countDone,
                // so a finished session actually reads as finished.
                const total = displayedGroups(workout.groups).length
                const finished = doneCount === total
                return (
                  <article
                    className={`hist-card ${highlightSession === session.id ? 'highlight' : ''}`}
                    id={`hist-${session.id}`}
                    key={session.id}
                  >
                    <button className="hist-open" type="button" onClick={() => setHistoryOptionsSessionId(session.id)}>
                      <span className="hist-main">
                        <strong>{workout.name}</strong>
                        <small>
                          {formatAbsolute(session.createdAt)}
                          {session.finishedAt !== undefined && session.finishedAt > session.createdAt &&
                            ` · ${formatDuration(session.finishedAt - session.createdAt)}`}
                        </small>
                        <small className="hist-ago">{formatRelative(session.createdAt)}</small>
                      </span>
                      <span className={`hist-chip ${finished ? 'done' : 'unfinished'}`}>
                        {finished ? 'Finished' : 'Unfinished'}
                        <em>{doneCount}/{total}</em>
                      </span>
                    </button>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </Page>
    )
  }

  const submitAuth = async () => {
    if (!authDialog || !supabase) {
      return
    }

    const email = authDialog.email.trim()
    const password = authDialog.password
    if (!email || !password) {
      setAuthDialog({ ...authDialog, error: 'Enter your email and password.', note: '' })
      void haptics.reject()
      return
    }

    setAuthDialog({ ...authDialog, busy: true, error: '', note: '' })

    if (authDialog.mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setAuthDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
        void haptics.reject()
      } else {
        setAuthDialog(null)
        void haptics.confirm()
      }
      return
    }

    const { data: signUpData, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setAuthDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
      void haptics.reject()
    } else if (signUpData.session) {
      setAuthDialog(null)
      void haptics.confirm()
    } else {
      setAuthDialog((current) =>
        current
          ? { ...current, mode: 'in', password: '', busy: false, error: '', note: 'Check your email to confirm the account, then sign in.' }
          : current,
      )
      void haptics.confirm()
    }
  }

  // "Forgot password?" — Supabase emails a reset link that opens the live web app, where the
  // PASSWORD_RECOVERY handler above prompts for a new password.
  const sendPasswordReset = async () => {
    if (!authDialog || !supabase || authDialog.busy) {
      return
    }

    const email = authDialog.email.trim()
    if (!email) {
      setAuthDialog({ ...authDialog, error: 'Enter your email first.', note: '' })
      void haptics.reject()
      return
    }

    setAuthDialog({ ...authDialog, busy: true, error: '', note: '' })
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: PUBLIC_APP_URL })
    if (error) {
      setAuthDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
      void haptics.reject()
    } else {
      setAuthDialog((current) =>
        current
          ? { ...current, busy: false, error: '', note: `Reset link sent to ${email}. Use it to set a new password.` }
          : current,
      )
      void haptics.confirm()
    }
  }

  const submitPassword = async () => {
    if (!passwordDialog || !supabase || passwordDialog.busy) {
      return
    }

    if (passwordDialog.value.length < 6) {
      setPasswordDialog({ ...passwordDialog, error: 'Password must be at least 6 characters.' })
      void haptics.reject()
      return
    }

    setPasswordDialog({ ...passwordDialog, busy: true, error: '' })
    const { error } = await supabase.auth.updateUser({ password: passwordDialog.value })
    if (error) {
      setPasswordDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
      void haptics.reject()
    } else {
      setPasswordDialog(null)
      void haptics.confirm()
    }
  }

  const retryCloudSync = () => {
    setCloudActionError('')
    manualSyncPendingRef.current = true
    if (syncReadyRef.current) {
      queueCloudPushRef.current()
    } else {
      setSyncAttempt((current) => current + 1)
    }
  }

  const signOut = async () => {
    if (!supabase || cloudActionBusy) {
      return
    }

    setCloudActionBusy(true)
    setCloudActionError('')
    const { error } = await supabase.auth.signOut()
    if (error) {
      setCloudActionBusy(false)
      setCloudActionError(`Sign out failed. ${error.message}`)
      void haptics.reject()
      return
    }

    // Forget which account this device last synced with, so signing back in (even to the same
    // account) re-shows the "choose which data to keep" prompt. This lets the user work locally after
    // logging out and consciously decide, on re-login, whether to keep those local changes or the
    // account's data — instead of silently last-write-wins overwriting one of them.
    setStored(SYNCED_ACCOUNT_KEY, '')
    manualSyncPendingRef.current = false
    setCloudActionBusy(false)
    setCloudUser(null)
    setAccountDialogOpen(false)
    void haptics.confirm()
  }

  const renderSettings = () => (
    <Page title="Settings" onBack={() => goBack({ name: 'main' })}>
      <div className="set-list">
        <button className="set-row" type="button" onClick={exportData}>
          <span className="set-main">
            <strong>Download backup</strong>
            <small className={backupMessage?.target === 'export' && backupMessage.error ? 'set-note-error' : undefined} role="status">
              {backupMessage?.target === 'export' ? backupMessage.text : 'Download a JSON backup'}
            </small>
          </span>
          <Icon name="download" />
        </button>

        <label className="set-row">
          <span className="set-main">
            <strong>Import backup</strong>
            <small className={backupMessage?.target === 'import' && backupMessage.error ? 'set-note-error' : undefined} role="status">
              {backupMessage?.target === 'import' ? backupMessage.text : 'Replace current data from a JSON backup'}
            </small>
          </span>
          <Icon name="upload" />
          <input type="file" accept="application/json,.json" onChange={importData} />
        </label>

        <button className="set-row" type="button" onClick={testVibration}>
          <span className="set-main">
            <strong>Test rest alert</strong>
            <small role="status">{vibrationMessage || 'Max vibration · sound only in headphones'}</small>
          </span>
          <Icon name="bell" />
        </button>

        <button className="set-row danger" type="button" onClick={resetData}>
          <span className="set-main">
            <strong>Reset workout data</strong>
            <small>Delete history, pass, and workout changes</small>
          </span>
          <Icon name="trash" />
        </button>
      </div>
    </Page>
  )

  const renderSession = (session: WorkoutSession) => {
    const workout = getWorkout(session.workoutId)
    // The workout (doing) screen shows collapsed slots (linked pairs merged); edit mode shows every
    // exercise as its own row.
    const slots = displayedGroups(workout.groups)
    // Edit mode may collapse to none; normal mode always keeps one shown exercise open. If the stored
    // expanded id is no longer a visible slot (e.g. it was just hidden by a swap), fall back to the
    // first slot.
    const storedExpanded = data.expandedBySession[session.id]
    const expandedGroupId = editMode
      ? storedExpanded ?? ''
      : (slots.some(({ group }) => group.id === storedExpanded) ? storedExpanded : '') || slots[0]?.group.id || ''
    const activeGroup = workout.groups.find((group) => group.id === expandedGroupId)
    const activeRest = clampRestValue(activeGroup?.restSeconds ?? DEFAULT_REST_SECONDS)
    const doneCount = countDone(session)

    return (
      <main className={`ws-screen${editMode ? ' editing' : ''}`}>
        <header className="ws-header">
          {editMode ? (
            <button className="ws-back" type="button" aria-label="Discard changes" onClick={() => window.history.back()}>
              <Icon name="close" />
            </button>
          ) : (
            <button className="ws-back" type="button" aria-label="Back" onClick={() => goBack({ name: 'main' })}>
              <Icon name="back" />
            </button>
          )}
          <div className="ws-head-title">
            <strong>{workout.name}</strong>
            {editMode ? (
              <span>Editing</span>
            ) : doneCount === slots.length && slots.length > 0 ? (
              <span className="complete">Workout complete</span>
            ) : (
              <span>{`${doneCount}/${slots.length} done`}</span>
            )}
          </div>
          <button
            className={`ws-back ws-edit-toggle${editMode ? ' saving' : ''}`}
            type="button"
            aria-label={editMode ? 'Save changes' : 'Edit workout'}
            onClick={() => {
              if (editMode) {
                if (editDirty) {
                  void haptics.confirm()
                }
                setEditMode(false)
              } else {
                editSnapshotRef.current = { templates: data.templates, sessions: data.sessions }
                setEditDirty(false)
                setEditMode(true)
              }
            }}
          >
            <Icon name={editMode ? 'check' : 'edit'} />
          </button>
          <div className="ws-rail" aria-label={`${doneCount} of ${slots.length} exercises done`}>
            {slots.map(({ group }) => {
              const groupEntry = session.groupEntries[group.id]
              const result = groupEntry?.entries[group.activeVariantId]?.result
              return <i className={result === 'success' ? 'done' : result === 'failure' ? 'failed' : ''} key={group.id} />
            })}
          </div>
        </header>

        <section className="ws-list" aria-label={`${workout.name} exercises`}>
          {editMode ? (
            <DndContext
              sensors={dragSensors}
              collisionDetection={closestCenter}
              onDragStart={() => void haptics.dragStart()}
              onDragEnd={(event) => reorderGroups(workout.id, event)}
            >
              <SortableContext items={workout.groups.map((group) => group.id)} strategy={verticalListSortingStrategy}>
                {workout.groups.map((group) => {
                  const partner = group.linkId
                    ? workout.groups.find((other) => other.id !== group.id && other.linkId === group.linkId)
                    : undefined
                  return (
                    <EditableExerciseItem
                      key={group.id}
                      id={group.id}
                      variant={soleVariant(group)}
                      restSeconds={group.restSeconds}
                      hidden={Boolean(group.hidden)}
                      linkedPartnerName={partner ? soleVariant(partner).name : undefined}
                      isExpanded={expandedGroupId === group.id}
                      canRemove={workout.groups.length > 1}
                      canLink={!group.linkId && workout.groups.some((other) => other.id !== group.id && !other.linkId)}
                      onToggle={() => toggleExpand(session.id, group.id)}
                      onVariant={(patch) => editVariant(session.id, group.id, group.activeVariantId, patch)}
                      onRest={(value) => editGroupRest(group.id, value)}
                      onRemove={() => removeGroup(workout.id, group.id)}
                      onToggleHidden={() => toggleHidden(workout.id, group.id)}
                      onLink={() => setLinkDialog({ workoutId: workout.id, groupId: group.id })}
                      onUnlink={() => unlinkExercise(workout.id, group.id)}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          ) : (
            slots.map(({ group, partner }, index) =>
              renderExerciseRow(workout, session, group, partner, expandedGroupId, index),
            )
          )}
          {editMode && (
            <button
              className="ws-add"
              type="button"
              onClick={() => {
                addExercise(workout.id, session.id)
                void haptics.confirm()
              }}
            >
              <Icon name="plus" size={18} />
              Add exercise
            </button>
          )}
        </section>

        {!editMode && renderRestTimer(activeRest)}
      </main>
    )
  }

  const renderExerciseRow = (
    workout: WorkoutTemplate,
    session: WorkoutSession,
    group: ExerciseGroup,
    partner: ExerciseGroup | undefined,
    expandedGroupId: string,
    index: number,
  ) => {
    const sessionGroup = ensureSessionGroup(session, group, data)
    const variant = getVariant(group, sessionGroup.activeVariantId)
    const entry = sessionGroup.entries[variant.id] ?? { weight: variant.weight }
    const displaySetup = getExerciseSetup(entry, variant)
    const displaySets = getExerciseSets(entry, variant)
    const displayReps = getExerciseReps(entry, variant)
    const previous = getPreviousResult(data, workout.id, session, group.id, variant.id)
    const isExpanded = expandedGroupId === group.id
    const muscle = muscleColor(variant.category)
    const numLabel = String(index + 1).padStart(2, '0')
    // "Increase weight?" confirmation: only when last time was a success and it hasn't been resolved
    // for this session yet. Failed / no-record exercises skip straight to the normal controls.
    const showIncrease = previous === 'success' && !entry.increaseResolved

    return (
      <article
        className={`ws-item${isExpanded ? ' open' : ''}${entry.result ? ' is-done' : ''}`}
        style={{ borderColor: isExpanded ? `${muscle}b0` : `${muscle}52` }}
        id={`exercise-${group.id}`}
        key={group.id}
      >
        <button
          className="ws-item-head"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => expandExercise(session.id, group.id)}
        >
          <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
          <span className="ws-num">{numLabel}</span>
          <span className="ws-name">{variant.name}</span>
          {isExpanded ? (
            <span className="ws-cat" style={{ color: muscle }}>
              {categoryLabel(variant.category)}
            </span>
          ) : entry.result ? (
            <span className={`ws-chip ${entry.result === 'success' ? 'done' : 'failed'}`}>{resultLabel(entry.result)}</span>
          ) : (
            <span className="ws-meta">{formatTarget(displaySets, displayReps)}</span>
          )}
        </button>

        <div className="ws-item-body" aria-hidden={!isExpanded} inert={!isExpanded}>
          <div className="ws-item-body-inner">
            <div className="ws-item-body-content">
              <div className="ws-facts">
                <div className="ws-fact">
                  <span>Setup</span>
                  <strong>{formatSetup(displaySetup)}</strong>
                </div>
                <div className="ws-fact">
                  <span>Target</span>
                  <strong>{formatTarget(displaySets, displayReps)}</strong>
                </div>
              </div>

              {variant.note && <p className="ws-note">{variant.note}</p>}

              <button
                className={`ws-guide ${guidanceClass(previous)}`}
                type="button"
                onClick={() =>
                  setPreviousDialog({ workoutId: workout.id, sessionId: session.id, groupId: group.id, variantId: variant.id })
                }
              >
                <Icon name={previous === 'success' ? 'arrow-up' : previous === 'failure' ? 'repeat' : 'clock'} size={18} />
                <span>{guidanceSentence(previous)}</span>
              </button>

              {showIncrease ? (
                <>
                  <div className="ws-step" aria-label={`${variant.name} weight increase`}>
                    <button
                      className="ws-stepbtn"
                      type="button"
                      aria-label="Decrease amount"
                      {...holdStepper.bind(() => adjustIncrease(session.id, group.id, variant.id, -1))}
                    >
                      <Icon name="minus" size={20} />
                    </button>
                    <button
                      className="ws-weight ws-weight-increase"
                      type="button"
                      onClick={() =>
                        setWeightDialog({
                          sessionId: session.id,
                          groupId: group.id,
                          variantId: variant.id,
                          increase: true,
                          value: entry.increaseDelta === undefined ? '' : String(entry.increaseDelta),
                        })
                      }
                    >
                      {entry.increaseDelta === undefined ? (
                        <strong className="ws-weight-prompt">
                          Increase
                          <br />
                          weight by?
                        </strong>
                      ) : (
                        <strong>{formatWeight(entry.increaseDelta)}</strong>
                      )}
                    </button>
                    <button
                      className="ws-stepbtn"
                      type="button"
                      aria-label="Increase amount"
                      {...holdStepper.bind(() => adjustIncrease(session.id, group.id, variant.id, 1))}
                    >
                      <Icon name="plus" size={20} />
                    </button>
                  </div>

                  <div className="ws-result" aria-label={`${variant.name} increase`}>
                    <button
                      className="ws-resultbtn done"
                      type="button"
                      onClick={() => acceptIncrease(session.id, group.id, variant.id)}
                    >
                      Apply
                    </button>
                    <button
                      className="ws-resultbtn failed"
                      type="button"
                      onClick={() => cancelIncrease(session.id, group.id, variant.id)}
                    >
                      Keep weight
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ws-step" aria-label={`${variant.name} weight`}>
                    <button
                      className="ws-stepbtn"
                      type="button"
                      aria-label="Decrease weight"
                      {...holdStepper.bind(() => adjustWeight(session.id, group.id, variant.id, -1.25))}
                    >
                      <Icon name="minus" size={20} />
                    </button>
                    <button
                      className="ws-weight"
                      type="button"
                      onClick={() =>
                        setWeightDialog({ sessionId: session.id, groupId: group.id, variantId: variant.id, value: String(entry.weight) })
                      }
                    >
                      <strong>{formatWeight(entry.weight)}</strong>
                      <span>{variant.perHand ? 'per hand' : 'total'}</span>
                    </button>
                    <button
                      className="ws-stepbtn"
                      type="button"
                      aria-label="Increase weight"
                      {...holdStepper.bind(() => adjustWeight(session.id, group.id, variant.id, 1.25))}
                    >
                      <Icon name="plus" size={20} />
                    </button>
                  </div>

                  <div className="ws-result" aria-label={`${variant.name} result`}>
                    <button
                      className={`ws-resultbtn done${entry.result === 'success' ? ' sel' : ''}`}
                      type="button"
                      aria-pressed={entry.result === 'success'}
                      onClick={() => setExerciseResult(session.id, group.id, variant.id, 'success')}
                    >
                      Done
                    </button>
                    <button
                      className={`ws-resultbtn failed${entry.result === 'failure' ? ' sel' : ''}`}
                      type="button"
                      aria-pressed={entry.result === 'failure'}
                      onClick={() => setExerciseResult(session.id, group.id, variant.id, 'failure')}
                    >
                      Failed
                    </button>
                  </div>
                </>
              )}

              {partner && (
                <button
                  className="ws-swap"
                  type="button"
                  onClick={() => swapLinked(session.id, workout.id, group.id, partner.id)}
                >
                  Swap with {soleVariant(partner).name}
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
    )
  }

  const renderRestTimer = (activeRest: number) => (
    <section className={`ws-dock${restRunning ? ' running' : ''}${restPulse ? ' pulse' : ''}`} aria-label="Rest timer">
      {restRunning ? (
        <>
          <div className="ws-dock-time">
            <span className="ws-dock-left">
              <Icon name="clock" size={18} />
              Rest
            </span>
            <strong>{formatTimer(restSeconds)}</strong>
            <span className="ws-dock-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, (restSeconds / Math.max(1, restDuration)) * 100))}%` }} />
            </span>
          </div>
          <button className="ws-dock-cancel ws-dock-extend" type="button" onClick={extendRest}>
            +10s
          </button>
          <button
            className="ws-dock-cancel"
            type="button"
            onClick={() => {
              setRestRunning(false)
              setRestEndsAt(null)
              setRestSeconds(activeRest)
              restAlertStartedRef.current = false
              setRestNotificationMessage('')
              haptics.cancelTimerAlert()
              void cancelRestNotification()
            }}
          >
            Stop
          </button>
        </>
      ) : (
        <button
          className="ws-dock-start"
          type="button"
          onClick={() => {
            const endsAt = Date.now() + activeRest * 1000
            restAlertStartedRef.current = false
            setRestSeconds(activeRest)
            setRestDuration(activeRest)
            setRestEndsAt(endsAt)
            setRestRunning(true)
            startRestAlarm(endsAt)
          }}
        >
          <span className="ws-dock-left">
            <Icon name={restPulse ? 'check' : 'clock'} size={18} />
            {restPulse ? 'Rest done' : 'Rest timer'}
          </span>
          <strong>{restPulse ? '' : `Start · ${formatTimer(activeRest)}`}</strong>
        </button>
      )}
      {restNotificationMessage && (
        <small className="ws-dock-note" role="status">
          {restNotificationMessage}
        </small>
      )}
    </section>
  )

  const openSession = (workoutId: WorkoutId, sessionId: string, confirmResume = true) => {
    setData((current) =>
      // Re-opening the already-current session isn't a data change — keep the object identity so it
      // doesn't count as a meaningful edit for sync.
      current.currentSessionByWorkout[workoutId] === sessionId
        ? current
        : {
            ...current,
            currentSessionByWorkout: {
              ...current.currentSessionByWorkout,
              [workoutId]: sessionId,
            },
          },
    )
    setEditMode(false)
    if (confirmResume) void haptics.confirm()
    navigate({ name: 'session', workoutId, sessionId })
  }

  const startSession = (workoutId: WorkoutId) => {
    const sessionId = createId()
    const session = createSession(workoutId, data, sessionId)
    setData((current) => ({
      ...current,
      sessions: [session, ...current.sessions],
      currentSessionByWorkout: {
        ...current.currentSessionByWorkout,
        [workoutId]: sessionId,
      },
      expandedBySession: {
        ...current.expandedBySession,
        [sessionId]: getWorkout(workoutId).groups[0]?.id ?? '',
      },
    }))
    setEditMode(false)
    void haptics.confirm()
    navigate({ name: 'session', workoutId, sessionId })
  }

  const removeGroup = (workoutId: WorkoutId, groupId: string) => {
    const workout = data.templates.find((template) => template.id === workoutId)
    if (!workout || workout.groups.length <= 1) {
      return
    }

    setConfirmDialog({
      title: 'Delete exercise?',
      message: 'This removes it from the workout.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setEditDirty(true)
        setData((current) => ({
          ...current,
          templates: current.templates.map((template) =>
            template.id === workoutId ? { ...template, groups: template.groups.filter((group) => group.id !== groupId) } : template,
          ),
        }))
        setConfirmDialog(null)
      },
    })
  }

  // Add a blank exercise to the routine and expand it inline so it can be filled in on the spot.
  const addExercise = (workoutId: WorkoutId, sessionId: string) => {
    const variantId = createId()
    const variant: ExerciseVariant = {
      id: variantId,
      name: 'New exercise',
      category: 'CHEST',
      setup: '',
      sets: 3,
      reps: 10,
      weight: 0,
      perHand: false,
      lastResult: 'missing',
    }
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === workoutId
          ? {
              ...template,
              groups: [
                ...template.groups,
                { id: variantId, activeVariantId: variantId, variants: [variant], restSeconds: current.restSeconds },
              ],
            }
          : template,
      ),
      baselineResults: { ...current.baselineResults, [variantId]: 'missing' },
      expandedBySession: { ...current.expandedBySession, [sessionId]: variantId },
    }))
  }

  const deleteSession = (sessionId: string) => {
    setConfirmDialog({
      title: 'Delete workout?',
      message: 'This removes it from History.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setData((current) => ({
          ...current,
          sessions: current.sessions.filter((session) => session.id !== sessionId),
          expandedBySession: removeKey(current.expandedBySession, sessionId),
          scrollBySession: removeKey(current.scrollBySession, sessionId),
          currentSessionByWorkout: Object.fromEntries(
            Object.entries(current.currentSessionByWorkout).filter(([, value]) => value !== sessionId),
          ) as Partial<Record<WorkoutId, string>>,
        }))
        setConfirmDialog(null)
      },
    })
  }

  const expandExercise = (sessionId: string, groupId: string) => {
    setData((current) => ({
      ...current,
      expandedBySession: {
        ...current.expandedBySession,
        [sessionId]: groupId,
      },
    }))
  }

  // Edit mode allows collapsing to none (so the whole list can be seen while reordering).
  const toggleExpand = (sessionId: string, groupId: string) => {
    setData((current) => ({
      ...current,
      expandedBySession: {
        ...current.expandedBySession,
        [sessionId]: current.expandedBySession[sessionId] === groupId ? '' : groupId,
      },
    }))
  }

  // Inline routine edit: update the template variant, and mirror the shared fields into the open
  // session so the current workout reflects the change too. Marks the routine dirty for save/discard.
  const editVariant = (sessionId: string, groupId: string, variantId: string, patch: Partial<ExerciseVariant>) => {
    setEditDirty(true)
    updateTemplateVariant(variantId, patch)
    const entryPatch: Partial<SessionExercise> = {}
    if (patch.setup !== undefined) entryPatch.setup = patch.setup
    if (patch.sets !== undefined) entryPatch.sets = patch.sets
    if (patch.reps !== undefined) entryPatch.reps = patch.reps
    if (patch.weight !== undefined) entryPatch.weight = patch.weight
    if (Object.keys(entryPatch).length > 0) {
      updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({ ...entry, ...entryPatch }))
    }
  }

  const editGroupRest = (groupId: string, value: number) => {
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => ({
        ...template,
        groups: template.groups.map((group) =>
          group.id === groupId ? { ...group, restSeconds: clampRestValue(value) } : group,
        ),
      })),
    }))
  }

  // Hide/show an exercise. For a linked pair exactly one member is visible, so toggling one flips its
  // partner the other way; for a standalone exercise it's a plain hide (removed from the workout).
  const toggleHidden = (workoutId: WorkoutId, groupId: string) => {
    const target = data.templates.find((template) => template.id === workoutId)?.groups.find((group) => group.id === groupId)
    if (!target) {
      return
    }
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== workoutId) {
          return template
        }
        const target = template.groups.find((group) => group.id === groupId)
        if (!target) {
          return template
        }
        const nextHidden = !target.hidden
        return {
          ...template,
          groups: template.groups.map((group) => {
            if (group.id === groupId) {
              return { ...group, hidden: nextHidden }
            }
            // Keep the partner opposite so a pair always has exactly one visible member.
            if (target.linkId && group.linkId === target.linkId) {
              return { ...group, hidden: !nextHidden }
            }
            return group
          }),
        }
      }),
    }))
    void haptics.confirm()
  }

  // Link the given exercise to another as a swap pair. The one higher in the list stays visible.
  const linkExercise = (workoutId: WorkoutId, groupId: string, targetId: string) => {
    const workout = data.templates.find((template) => template.id === workoutId)
    if (!workout?.groups.some((group) => group.id === groupId) || !workout.groups.some((group) => group.id === targetId)) {
      return
    }
    setLinkDialog(null)
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== workoutId) {
          return template
        }
        const linkId = createId()
        const firstIndex = Math.min(
          template.groups.findIndex((group) => group.id === groupId),
          template.groups.findIndex((group) => group.id === targetId),
        )
        const topmostId = template.groups[firstIndex]?.id
        return {
          ...template,
          groups: template.groups.map((group) =>
            group.id === groupId || group.id === targetId
              ? { ...group, linkId, hidden: group.id !== topmostId }
              : group,
          ),
        }
      }),
    }))
    void haptics.confirm()
  }

  // Unlink an exercise from its pair: both become standalone and visible again.
  const unlinkExercise = (workoutId: WorkoutId, groupId: string) => {
    const target = data.templates.find((template) => template.id === workoutId)?.groups.find((group) => group.id === groupId)
    if (!target?.linkId) {
      return
    }
    setEditDirty(true)
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== workoutId) {
          return template
        }
        const target = template.groups.find((group) => group.id === groupId)
        const linkId = target?.linkId
        if (!linkId) {
          return template
        }
        return {
          ...template,
          groups: template.groups.map((group) =>
            group.linkId === linkId ? { ...group, linkId: undefined, hidden: false } : group,
          ),
        }
      }),
    }))
    void haptics.confirm()
  }

  // Swap which member of a linked pair is visible (used on the workout screen). Move the expanded
  // state to the newly-visible partner so the slot the user was on stays open.
  const swapLinked = (sessionId: string, workoutId: WorkoutId, currentId: string, partnerId: string) => {
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === workoutId
          ? {
              ...template,
              groups: template.groups.map((group) => {
                if (group.id === currentId) {
                  return { ...group, hidden: true }
                }
                if (group.id === partnerId) {
                  return { ...group, hidden: false }
                }
                return group
              }),
            }
          : template,
      ),
      expandedBySession: { ...current.expandedBySession, [sessionId]: partnerId },
    }))
    void haptics.selection()
  }

  // Returns whether the weight actually changed, so callers only give haptic feedback for a real
  // step (a − at 0 kg stays silent, matching every other stepper at its bound).
  const adjustWeight = (sessionId: string, groupId: string, variantId: string, delta: number): boolean => {
    const session = dataRef.current.sessions.find((candidate) => candidate.id === sessionId)
    const currentWeight = session ? getEntry(session, groupId, variantId).weight : 0
    if (roundWeight(Math.max(0, currentWeight + delta)) === currentWeight) {
      return false
    }
    updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({
      ...entry,
      weight: roundWeight(Math.max(0, entry.weight + delta)),
    }))
    return true
  }

  // "Increase weight by?" stage. The first −/+ tap seeds the amount (0 from −, 1.25 from +); after
  // that it steps by ±1.25 and never goes below 0. Returns whether the amount actually changed, so
  // taps and hold-repeats give the same per-step feedback as the normal weight stepper.
  const adjustIncrease = (sessionId: string, groupId: string, variantId: string, direction: 1 | -1): boolean => {
    const session = dataRef.current.sessions.find((candidate) => candidate.id === sessionId)
    const current = session ? getEntry(session, groupId, variantId).increaseDelta : undefined
    const next = roundWeight(current === undefined ? (direction < 0 ? 0 : 1.25) : Math.max(0, current + direction * 1.25))
    if (next === current) {
      return false
    }
    updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({ ...entry, increaseDelta: next }))
    return true
  }

  // Accept the increase: add the chosen amount on top of last session's carried weight and return the
  // card to its normal state. An unset amount counts as +0 (a deliberate "no change today").
  const acceptIncrease = (sessionId: string, groupId: string, variantId: string) => {
    updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({
      ...entry,
      weight: roundWeight(entry.weight + (entry.increaseDelta ?? 0)),
      increaseDelta: undefined,
      increaseResolved: true,
    }))
    void haptics.confirm()
  }

  // Cancel: ignore any entered amount and keep the carried weight, but still mark the stage resolved
  // so the normal controls appear. Same feedback tier as Accept — it's the same decision pair.
  const cancelIncrease = (sessionId: string, groupId: string, variantId: string) => {
    updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({
      ...entry,
      increaseDelta: undefined,
      increaseResolved: true,
    }))
  }

  const setExerciseResult = (sessionId: string, groupId: string, variantId: string, status: ResultStatus) => {
    setData((current) => {
      let updatedSession: WorkoutSession | undefined
      const sessions = current.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session
        }

        const entry = getEntry(session, groupId, variantId)
        const nextResult = toggleResult(entry.result, status)
        const wasFinished = isSessionFinished(session)
        updatedSession = updateSessionEntry(session, groupId, variantId, {
          ...entry,
          result: nextResult,
        })
        // Stamp the finish time when this result completes the session, so History can show how
        // long the workout took. Re-finishing after clearing a result re-stamps to the real end.
        if (!wasFinished && isSessionFinished(updatedSession)) {
          updatedSession = { ...updatedSession, finishedAt: Date.now() }
        }
        return updatedSession
      })

      const nextExpanded =
        updatedSession && getEntry(updatedSession, groupId, variantId).result
          ? getNextPendingGroupId(updatedSession, groupId) ?? groupId
          : groupId

      return {
        ...current,
        sessions,
        expandedBySession: {
          ...current.expandedBySession,
          [sessionId]: nextExpanded,
        },
      }
    })
    void haptics.confirm()
  }

  const updateExerciseEntry = (
    sessionId: string,
    groupId: string,
    variantId: string,
    updater: (entry: SessionExercise) => SessionExercise,
  ) => {
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId ? updateSessionEntry(session, groupId, variantId, updater(getEntry(session, groupId, variantId))) : session,
      ),
    }))
  }

  const updateTemplateVariant = (variantId: string, patch: Partial<ExerciseVariant>) => {
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => ({
        ...template,
        groups: template.groups.map((group) => ({
          ...group,
          variants: group.variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
        })),
      })),
    }))
  }

  const saveManualWeight = () => {
    if (!weightDialog) {
      return
    }

    const parsed = Number(weightDialog.value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      void haptics.reject()
      return
    }

    const nextWeight = roundWeight(parsed)
    const session = data.sessions.find((candidate) => candidate.id === weightDialog.sessionId)
    const currentEntry = session
      ? getEntry(session, weightDialog.groupId, weightDialog.variantId)
      : undefined
    const unchanged = weightDialog.increase
      ? currentEntry?.increaseDelta === nextWeight
      : currentEntry?.weight === nextWeight
    if (!unchanged) {
      updateExerciseEntry(weightDialog.sessionId, weightDialog.groupId, weightDialog.variantId, (entry) =>
        weightDialog.increase
          ? { ...entry, increaseDelta: nextWeight }
          : { ...entry, weight: nextWeight },
      )
    }
    setWeightDialog(null)
    if (!unchanged) {
      void haptics.confirm()
    }
  }

  const setPreviousResult = (status: PreviousResult) => {
    if (!previousDialog) {
      return
    }

    const currentSession = data.sessions.find((candidate) => candidate.id === previousDialog.sessionId)
    if (!currentSession) {
      setPreviousDialog(null)
      return
    }
    const currentTarget = findPreviousTarget(
      data,
      previousDialog.workoutId,
      currentSession,
      previousDialog.groupId,
      previousDialog.variantId,
    )
    const currentResult = currentTarget.sessionId
      ? data.sessions.find((candidate) => candidate.id === currentTarget.sessionId)
          ?.groupEntries[previousDialog.groupId]?.entries[previousDialog.variantId]?.result ?? 'missing'
      : data.baselineResults[previousDialog.variantId] ?? 'missing'
    const currentEntry = currentSession.groupEntries[previousDialog.groupId]?.entries[previousDialog.variantId]
    const reopensIncrease = Boolean(currentEntry?.increaseResolved || currentEntry?.increaseDelta !== undefined)
    const changed = currentResult !== status || reopensIncrease

    setData((current) => {
      const session = current.sessions.find((candidate) => candidate.id === previousDialog.sessionId)
      if (!session) {
        return current
      }

      const target = findPreviousTarget(current, previousDialog.workoutId, session, previousDialog.groupId, previousDialog.variantId)

      // Re-choosing the previous result reopens the "Increase weight?" stage on the current card, so
      // toggling it away from and back to "done" lets the user increase again (stacking on top of any
      // increase they already applied). Only clears the increase flags; the weight is preserved.
      const reopenIncrease = (candidate: WorkoutSession): WorkoutSession => {
        if (candidate.id !== previousDialog.sessionId) {
          return candidate
        }
        const existing = candidate.groupEntries[previousDialog.groupId]?.entries[previousDialog.variantId]
        if (!existing) {
          return candidate
        }
        return updateSessionEntry(candidate, previousDialog.groupId, previousDialog.variantId, {
          ...existing,
          increaseResolved: false,
          increaseDelta: undefined,
        })
      }

      let sessions = current.sessions
      if (target.sessionId) {
        sessions = sessions.map((candidate) =>
          candidate.id === target.sessionId
            ? updateSessionEntry(candidate, previousDialog.groupId, previousDialog.variantId, {
                ...getEntry(candidate, previousDialog.groupId, previousDialog.variantId),
                result: status === 'missing' ? undefined : status,
              })
            : candidate,
        )
      }
      sessions = sessions.map(reopenIncrease)

      return {
        ...current,
        sessions,
        baselineResults: target.sessionId
          ? current.baselineResults
          : { ...current.baselineResults, [previousDialog.variantId]: status },
      }
    })

    setPreviousDialog(null)
    if (changed) {
      void haptics.confirm()
    }
  }

  // Store the gym's entry QR code: read the picked image, downscale it to a phone-screen-friendly
  // size on a canvas, and keep it as a data URL inside AppData (so it syncs like everything else).
  // PNG keeps QR edges sharp; a large photo falls back to JPEG so it can't blow the storage quota.
  const importGymPass = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    const fail = () => {
      setPassError('Could not read the image. Try a screenshot or photo of the QR code.')
      void haptics.reject()
    }

    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          fail()
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length > 400_000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        }
        setPassError('')
        setData((current) => ({ ...current, gymPass: dataUrl }))
        void haptics.confirm()
      }
      image.onerror = fail
      image.src = String(reader.result)
    }
    reader.onerror = fail
    reader.readAsDataURL(file)
  }

  const removeGymPass = () => {
    setConfirmDialog({
      title: 'Delete gym pass?',
      message: 'Deletes the saved QR code.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setData((current) => ({ ...current, gymPass: undefined }))
        setConfirmDialog(null)
      },
    })
  }

  const exportData = () => {
    let url = ''
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `fitness-hub-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      void haptics.confirm()
      setBackupMessage({ target: 'export', text: 'Backup downloaded.' })
    } catch {
      void haptics.reject()
      setBackupMessage({ target: 'export', text: 'Backup download failed.', error: true })
    } finally {
      if (url) {
        // Give the browser a moment to start the download before releasing the blob — revoking in
        // the same tick can abort the save on some browsers.
        const staleUrl = url
        window.setTimeout(() => URL.revokeObjectURL(staleUrl), 2000)
      }
    }
  }

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result))
        if (!isValidBackup(parsed)) {
          throw new Error('Invalid Fitness Hub backup')
        }
        setData(normalizeData(parsed))
        void haptics.confirm()
        setBackupMessage({ target: 'import', text: 'Backup imported.' })
      } catch {
        void haptics.reject()
        setBackupMessage({ target: 'import', text: 'Invalid backup file.', error: true })
      }
    }
    reader.onerror = () => {
      void haptics.reject()
      setBackupMessage({ target: 'import', text: 'Could not read the backup file.', error: true })
    }
    reader.readAsText(file)
  }

  const resetData = () => {
    setConfirmDialog({
      title: 'Reset workout data?',
      message: 'Deletes workout history, gym pass, and workout changes.',
      confirmLabel: 'Reset',
      danger: true,
      onConfirm: () => {
        setData(buildInitialData())
        setConfirmDialog(null)
      },
    })
  }

  const testVibration = () => {
    void haptics.timerFinished(true).then((performed) => {
      setVibrationMessage(performed ? 'Alert played.' : 'Vibration is off or unavailable.')
    })
  }

  const renderScreen = () => {
    if (screen.name === 'global-history') {
      return renderHistory(sortedSessions, () => goBack({ name: 'main' }))
    }

    if (screen.name === 'settings') {
      return renderSettings()
    }

  if (screen.name === 'session') {
    const currentSession = data.sessions.find((session) => session.id === screen.sessionId)
    return (
      <>
        {currentSession ? (
          renderSession(currentSession)
        ) : (
          <Page title="Workout unavailable" onBack={() => goBack({ name: 'main' })}>
            <EmptyState text="This workout no longer exists." />
          </Page>
        )}
        {weightDialog && (
          <Dialog title={weightDialog.increase ? 'Increase weight by' : 'Edit weight'}>
            <input
              className="number-input"
              inputMode="decimal"
              type="number"
              min="0"
              step="1.25"
              value={weightDialog.value}
              onChange={(event) => setWeightDialog({ ...weightDialog, value: event.target.value })}
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setWeightDialog(null)}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={saveManualWeight}>
                Save
              </button>
            </div>
          </Dialog>
        )}
        {previousDialog && (
          <Dialog title="Last result">
            <p className="dialog-help">Choose the result from your last workout.</p>
            <div className="choice-list">
              <button className="choice done" type="button" onClick={() => setPreviousResult('success')}>
                <Icon name="arrow-up" size={18} />
                <span>Done — increase today</span>
              </button>
              <button className="choice failed" type="button" onClick={() => setPreviousResult('failure')}>
                <Icon name="repeat" size={18} />
                <span>Failed — repeat today</span>
              </button>
              <button className="choice" type="button" onClick={() => setPreviousResult('missing')}>
                <Icon name="clock" size={18} />
                <span>No result</span>
              </button>
            </div>
            <button className="choice-cancel" type="button" onClick={() => setPreviousDialog(null)}>
              Cancel
            </button>
          </Dialog>
        )}
        {linkDialog &&
          (() => {
            const workout = data.templates.find((template) => template.id === linkDialog.workoutId)
            const source = workout?.groups.find((group) => group.id === linkDialog.groupId)
            const candidates = (workout?.groups ?? []).filter(
              (group) => group.id !== linkDialog.groupId && !group.linkId,
            )
            return (
              <Dialog title="Link exercise">
                <p className="dialog-help">
                  Choose the exercise to swap with {source ? soleVariant(source).name : 'this exercise'}.
                </p>
                {candidates.length === 0 ? (
                  <p className="dialog-help">No exercises available.</p>
                ) : (
                  <div className="choice-list">
                    {candidates.map((group) => (
                      <button
                        key={group.id}
                        className="choice"
                        type="button"
                        onClick={() => linkExercise(linkDialog.workoutId, linkDialog.groupId, group.id)}
                      >
                        <span
                          className="ws-dot"
                          style={{ background: muscleColor(soleVariant(group).category) }}
                          aria-hidden="true"
                        />
                        <span>{soleVariant(group).name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="choice-cancel" type="button" onClick={() => setLinkDialog(null)}>
                  Cancel
                </button>
              </Dialog>
            )
          })()}
      </>
    )
  }

    return renderMain()
  }

  return (
    <>
      {renderScreen()}
      {authDialog && (
        <Dialog title={authDialog.mode === 'in' ? 'Sign in' : 'Create account'}>
          <label className="ex-field">
            <span>Email</span>
            <input
              className="number-input text-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={authDialog.email}
              onChange={(event) => setAuthDialog({ ...authDialog, email: event.target.value, error: '' })}
            />
          </label>
          <label className="ex-field">
            <span>Password</span>
            <PasswordInput
              autoComplete={authDialog.mode === 'in' ? 'current-password' : 'new-password'}
              value={authDialog.password}
              onChange={(value) => setAuthDialog({ ...authDialog, password: value, error: '' })}
            />
          </label>
          <div className="auth-links">
            <button
              className="auth-switch"
              type="button"
              onClick={() => {
                setAuthDialog({ ...authDialog, mode: authDialog.mode === 'in' ? 'up' : 'in', error: '', note: '' })
                void haptics.selection()
              }}
            >
              {authDialog.mode === 'in' ? 'Create account' : 'Sign in instead'}
            </button>
            {authDialog.mode === 'in' && (
              <button className="auth-switch" type="button" disabled={authDialog.busy} onClick={() => void sendPasswordReset()}>
                Forgot password?
              </button>
            )}
          </div>
          {authDialog.error && <p className="auth-error" role="alert">{authDialog.error}</p>}
          {authDialog.note && <p className="dialog-help">{authDialog.note}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={() => setAuthDialog(null)}>
              Cancel
            </button>
            <button className="primary-action" type="button" disabled={authDialog.busy} aria-busy={authDialog.busy} onClick={submitAuth}>
              {authDialog.busy ? (authDialog.mode === 'in' ? 'Signing in…' : 'Creating…') : authDialog.mode === 'in' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </Dialog>
      )}
      {accountDialogOpen && cloudUser && !passwordDialog && (
        <Dialog title="Account">
          <p className="dialog-help">Signed in as {cloudUser.email}</p>
          <div className="account-status">
            <span className={`sync-status ${syncStatus}`} aria-live="polite">
              <i aria-hidden="true" />
              {syncStatusLabel(syncStatus)}
            </span>
            <small>{lastSyncedAt !== null ? `Last synced ${formatRelative(lastSyncedAt)}` : 'Not synced on this device'}</small>
            {syncStatus === 'error' && syncError && <span className="cloud-error">{syncError}</span>}
            {cloudActionError && <span className="cloud-error" role="alert">{cloudActionError}</span>}
          </div>
          <div className="choice-list">
            <button className="choice" type="button" onClick={retryCloudSync}>
              <Icon name="cloud" size={18} />
              <span>Sync</span>
            </button>
            <button
              className="choice"
              type="button"
              onClick={() => setPasswordDialog({ mode: 'change', value: '', error: '', busy: false })}
            >
              <Icon name="edit" size={18} />
              <span>Change password</span>
            </button>
            <button className="choice" type="button" disabled={cloudActionBusy} aria-busy={cloudActionBusy} onClick={() => void signOut()}>
              <Icon name="close" size={18} />
              <span>{cloudActionBusy ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
          <button className="choice-cancel" type="button" onClick={() => setAccountDialogOpen(false)}>
            Close
          </button>
        </Dialog>
      )}
      {apkDialogOpen &&
        (() => {
          const { native, build, released, updateAvailable, upToDate } = apkStatus()
          const nativeUpdater = native && appUpdateState.status !== 'unsupported'
          const updateBusy = appUpdateState.status === 'checking' || appUpdateState.status === 'downloading'
          const updateReady = appUpdateState.status === 'ready' || appUpdateState.status === 'permission-required'
          return (
            <Dialog title="Android app">
              <p className="dialog-help">
                {nativeUpdater ? 'Download and install the latest build.' : 'Download the Android app.'}
              </p>
              <div className="account-status">
                {updateAvailable ? (
                  <span className="sync-status update">
                    <i aria-hidden="true" />
                    Update available
                  </span>
                ) : upToDate ? (
                  <span className="sync-status synced">
                    <i aria-hidden="true" />
                    Up to date
                  </span>
                ) : native ? (
                  <span className="sync-status">
                    <i aria-hidden="true" />
                    Version unknown
                  </span>
                ) : (
                  <span className="sync-status">
                    <i aria-hidden="true" />
                    Not installed on this device
                  </span>
                )}
                <small>
                  {native && installedBuild !== null && `Installed: Build ${installedBuild} · `}
                  {build !== null ? `Latest: Build ${build}${released ? `, released ${released}` : ''}` : 'Latest version unavailable'}
                </small>
              </div>
              {nativeUpdater && appUpdateState.status === 'downloading' && (
                <div className="update-progress" role="status" aria-label={`Downloading ${appUpdateState.progress}%`}>
                  <span>Downloading <strong>{appUpdateState.progress}%</strong></span>
                  <progress max="100" value={appUpdateState.progress} />
                </div>
              )}
              {nativeUpdater && appUpdateState.status === 'ready' && (
                <p className="dialog-help">Download complete. Install when ready.</p>
              )}
              {nativeUpdater && appUpdateState.status === 'installing' && (
                <p className="dialog-help">Installer opened.</p>
              )}
              {nativeUpdater && appUpdateState.detail && (
                <p className={appUpdateState.status === 'failed' ? 'auth-error' : 'dialog-help'} role={appUpdateState.status === 'failed' ? 'alert' : 'status'}>
                  {appUpdateState.detail}
                </p>
              )}
              <div className="choice-list">
                {nativeUpdater ? (
                  <button
                    className="choice"
                    type="button"
                    disabled={updateBusy || appUpdateState.status === 'installing'}
                    aria-busy={updateBusy}
                    onClick={() => void (updateReady ? installAppUpdate() : startAppUpdate())}
                  >
                    <Icon name={updateReady ? 'forward' : 'download'} size={18} />
                    <span>
                      {appUpdateState.status === 'checking'
                        ? 'Checking…'
                        : appUpdateState.status === 'downloading'
                          ? 'Downloading…'
                          : appUpdateState.status === 'installing'
                            ? 'Installer opened'
                            : updateReady
                              ? 'Install update'
                              : build !== null
                                ? `Download build ${build}`
                                : 'Download update'}
                    </span>
                  </button>
                ) : (
                  <a
                    className="choice"
                    href={APK_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => void haptics.confirm()}
                  >
                    <Icon name="download" size={18} />
                    <span>{native ? 'Download in browser' : build !== null ? `Download build ${build}` : 'Download'}</span>
                  </a>
                )}
              </div>
              <button className="choice-cancel" type="button" onClick={() => setApkDialogOpen(false)}>
                Close
              </button>
            </Dialog>
          )
        })()}
      {passDialogOpen && (
        <Dialog title="Gym pass">
          {data.gymPass ? (
            <div className="pass-image">
              <img src={data.gymPass} alt="Gym pass QR code" />
            </div>
          ) : (
            <p className="dialog-help">Add your gym pass QR code. A tight crop scans best.</p>
          )}
          {passError && <p className="auth-error" role="alert">{passError}</p>}
          <div className="choice-list">
            {data.gymPass ? (
              <button className="choice failed" type="button" onClick={removeGymPass}>
                <Icon name="trash" size={18} />
                <span>Delete</span>
              </button>
            ) : (
              <label className="choice">
                <Icon name="upload" size={18} />
                <span>Choose image</span>
                <input type="file" accept="image/*" onChange={importGymPass} />
              </label>
            )}
          </div>
          <button className="choice-cancel" type="button" onClick={() => setPassDialogOpen(false)}>
            Close
          </button>
        </Dialog>
      )}
      {aboutDialogOpen && (
        <Dialog title="About">
          <p className="dialog-help">
            Track workouts, weights, rest times, and results. Works offline; sign in to sync across devices.
          </p>
          <button className="choice-cancel" type="button" onClick={() => setAboutDialogOpen(false)}>
            Close
          </button>
        </Dialog>
      )}
      {passwordDialog && (
        <Dialog title={passwordDialog.mode === 'recovery' ? 'Set a new password' : 'Change password'}>
          {passwordDialog.mode === 'recovery' && (
            <p className="dialog-help">Enter a new account password.</p>
          )}
          <label className="ex-field">
            <span>New password</span>
            <PasswordInput
              autoComplete="new-password"
              value={passwordDialog.value}
              onChange={(value) => setPasswordDialog({ ...passwordDialog, value, error: '' })}
            />
          </label>
          {passwordDialog.error && <p className="auth-error" role="alert">{passwordDialog.error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={() => setPasswordDialog(null)}>
              Cancel
            </button>
            <button className="primary-action" type="button" disabled={passwordDialog.busy} aria-busy={passwordDialog.busy} onClick={() => void submitPassword()}>
              {passwordDialog.busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Dialog>
      )}
      {syncConflict && (
        <Dialog title="Choose data">
          <p className="dialog-help">
            Account and device data differ. Choose one; the other will be replaced.
          </p>
          <div className="choice-list">
            <button className="choice done" type="button" onClick={() => void resolveSyncConflict('account')}>
              <Icon name="cloud" size={18} />
              <span>Use account data</span>
            </button>
            <button className="choice" type="button" onClick={() => void resolveSyncConflict('device')}>
              <Icon name="download" size={18} />
              <span>Use device data</span>
            </button>
          </div>
          <button className="choice-cancel" type="button" onClick={() => void cancelSyncConflict()}>
            Cancel and sign out
          </button>
        </Dialog>
      )}
      {historyOptionsSession && (
        <Dialog title="Workout options">
          <p className="dialog-help">
            {getWorkout(historyOptionsSession.workoutId).name} · {formatAbsolute(historyOptionsSession.createdAt)}
          </p>
          <div className="choice-list">
            <button
              className="choice"
              type="button"
              onClick={() => {
                setHistoryOptionsSessionId(null)
                openSession(historyOptionsSession.workoutId, historyOptionsSession.id, false)
              }}
            >
              <Icon name="edit" size={18} />
              <span>Edit workout</span>
            </button>
            {historyOptionsSession.finishedAt !== undefined && historyOptionsSession.finishedAt > historyOptionsSession.createdAt && (
              <button className="choice" type="button" onClick={() => openDurationEditor(historyOptionsSession)}>
                <Icon name="clock" size={18} />
                <span>Edit duration</span>
              </button>
            )}
            <button
              className="choice failed"
              type="button"
              onClick={() => {
                setHistoryOptionsSessionId(null)
                deleteSession(historyOptionsSession.id)
              }}
            >
              <Icon name="trash" size={18} />
              <span>Delete workout</span>
            </button>
          </div>
          <button className="choice-cancel" type="button" onClick={() => setHistoryOptionsSessionId(null)}>
            Cancel
          </button>
        </Dialog>
      )}
      {durationDialog && (
        <DurationEditor
          dialog={durationDialog}
          onChange={setDurationDialog}
          onCancel={() => setDurationDialog(null)}
          onSave={saveDuration}
        />
      )}
      {confirmDialog && (
        <Dialog title={confirmDialog.title}>
          <p className="dialog-help">{confirmDialog.message}</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setConfirmDialog(null)}>
              Cancel
            </button>
            <button
              className={confirmDialog.danger ? 'danger-action' : 'primary-action'}
              type="button"
              onClick={() => {
                confirmDialog.onConfirm()
                void haptics.confirm()
              }}
            >
              {confirmDialog.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="page">
      <header className="page-head">
        <button className="ws-back" type="button" aria-label="Back" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  )
}

function Dialog({ title, children }: { title: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    if (!dialog) {
      return
    }

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    const focusableSelector =
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus())

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        window.history.back()
        return
      }
      if (event.key !== 'Tab') {
        return
      }

      const controls = focusable()
      if (controls.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInside)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', keepFocusInside)
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      previouslyFocused?.focus()
    }
  }, [])

  // Intentionally no tap-outside-to-close: dialogs are dismissed only via their Cancel button or
  // Escape/system back (handled by the overlay history sync), so a stray tap can't discard input.
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>
}

function buildInitialData(): AppData {
  const variantPrefs: Record<string, string> = {}
  const baselineResults: Record<string, PreviousResult> = {}

  defaultWorkouts.forEach((workout) => {
    workout.groups.forEach((group) => {
      variantPrefs[group.id] = group.activeVariantId
      group.variants.forEach((variant) => {
        baselineResults[variant.id] = variant.lastResult
      })
    })
  })

  return {
    sessions: [],
    variantPrefs,
    templates: cloneWorkouts(),
    baselineResults,
    expandedBySession: {},
    scrollBySession: {},
    currentSessionByWorkout: {},
    restSeconds: DEFAULT_REST_SECONDS,
  }
}

function loadData(): AppData {
  const saved = getStored(STORAGE_KEY)
  if (!saved) {
    return buildInitialData()
  }

  try {
    return normalizeData(JSON.parse(saved))
  } catch {
    return buildInitialData()
  }
}

// Always start on the main menu. A cold start (force-stop / closed from recents) reloads the
// page and lands here; minimizing the app keeps the running React state, so the current screen is
// preserved on resume without persisting it.
function loadScreen(): Screen {
  return { name: 'main' }
}

function normalizeData(value: unknown): AppData {
  const base = buildInitialData()
  if (!isRecord(value)) {
    return base
  }

  const partial = value as Partial<AppData>
  const defaultRest =
    typeof partial.restSeconds === 'number' && partial.restSeconds > 0 ? partial.restSeconds : DEFAULT_REST_SECONDS

  return {
    sessions: isValidSessions(partial.sessions) ? (partial.sessions as WorkoutSession[]) : [],
    variantPrefs: { ...base.variantPrefs, ...(partial.variantPrefs ?? {}) },
    templates: normalizeTemplates(value, defaultRest),
    baselineResults: { ...base.baselineResults, ...(partial.baselineResults ?? {}) },
    expandedBySession: partial.expandedBySession ?? {},
    scrollBySession: partial.scrollBySession ?? {},
    currentSessionByWorkout: partial.currentSessionByWorkout ?? {},
    restSeconds: defaultRest,
    gymPass: typeof partial.gymPass === 'string' && partial.gymPass.startsWith('data:image/') ? partial.gymPass : undefined,
  }
}

function normalizeTemplates(value: unknown, defaultRest: number): WorkoutTemplate[] {
  const legacy = value as { templates?: unknown; variantOverrides?: Record<string, Partial<ExerciseVariant>> }
  let templates: WorkoutTemplate[]
  if (isValidTemplates(legacy.templates)) {
    templates = legacy.templates as WorkoutTemplate[]
  } else {
    templates = cloneWorkouts()
    const overrides = legacy.variantOverrides
    if (overrides && typeof overrides === 'object') {
      templates.forEach((template) =>
        template.groups.forEach((group) =>
          group.variants.forEach((variant) => {
            const override = overrides[variant.id]
            if (override) {
              Object.assign(variant, override)
            }
          }),
        ),
      )
    }
  }

  // Migrate in per-exercise rest for saves that predate it.
  return templates.map((template) => ({
    ...template,
    groups: template.groups.map((group) => ({
      ...group,
      restSeconds:
        typeof group.restSeconds === 'number' && group.restSeconds > 0 ? group.restSeconds : defaultRest,
    })),
  }))
}

function createSession(workoutId: WorkoutId, data: AppData, sessionId: string): WorkoutSession {
  const workout = getWorkout(workoutId)
  const groupEntries: Record<string, SessionGroup> = {}

  workout.groups.forEach((group) => {
    const activeVariantId = data.variantPrefs[group.id] ?? group.activeVariantId
    const entries: Record<string, SessionExercise> = {}

    group.variants.forEach((variant) => {
      entries[variant.id] = createSessionEntry(data, workoutId, variant)
    })

    groupEntries[group.id] = {
      activeVariantId,
      entries,
    }
  })

  return {
    id: sessionId,
    workoutId,
    createdAt: Date.now(),
    groupEntries,
  }
}

function createSessionEntry(data: AppData, workoutId: WorkoutId, variant: ExerciseVariant): SessionExercise {
  return {
    weight: getLatestWeight(data, workoutId, variant.id) ?? variant.weight,
    setup: variant.setup,
    sets: variant.sets,
    reps: variant.reps,
  }
}

let templatesRef: WorkoutTemplate[] = defaultWorkouts

function cloneWorkouts(): WorkoutTemplate[] {
  return structuredClone(defaultWorkouts)
}

function getWorkout(workoutId: WorkoutId) {
  return templatesRef.find((workout) => workout.id === workoutId) ?? templatesRef[0]
}

function getVariant(group: ExerciseGroup, variantId: string) {
  return group.variants.find((candidate) => candidate.id === variantId) ?? group.variants[0]
}

// The single exercise a group holds (groups are single-exercise now).
function soleVariant(group: ExerciseGroup) {
  return group.variants[0]
}

// The slots shown on the workout (doing) screen: each linked pair collapses to one slot at its
// topmost member's position, showing the visible member (with its partner for the Swap button);
// hidden standalone exercises are dropped.
function displayedGroups(groups: ExerciseGroup[]): { group: ExerciseGroup; partner?: ExerciseGroup }[] {
  const seenLinks = new Set<string>()
  const slots: { group: ExerciseGroup; partner?: ExerciseGroup }[] = []
  for (const group of groups) {
    if (group.linkId) {
      if (seenLinks.has(group.linkId)) {
        continue
      }
      seenLinks.add(group.linkId)
      const members = groups.filter((candidate) => candidate.linkId === group.linkId)
      const visible = members.find((candidate) => !candidate.hidden) ?? members[0]
      slots.push({ group: visible, partner: members.find((candidate) => candidate.id !== visible.id) })
    } else if (!group.hidden) {
      slots.push({ group })
    }
  }
  return slots
}

function ensureSessionGroup(session: WorkoutSession, group: ExerciseGroup, data: AppData): SessionGroup {
  const existing = session.groupEntries[group.id]
  if (existing) {
    return existing
  }

  const entries: Record<string, SessionExercise> = {}
  group.variants.forEach((variant) => {
    entries[variant.id] = createSessionEntry(data, session.workoutId, variant)
  })

  return {
    activeVariantId: data.variantPrefs[group.id] ?? group.activeVariantId,
    entries,
  }
}

function getEntry(session: WorkoutSession, groupId: string, variantId: string): SessionExercise {
  return session.groupEntries[groupId]?.entries[variantId] ?? { weight: 0 }
}

function getExerciseSetup(entry: SessionExercise, variant: ExerciseVariant) {
  return entry.setup ?? variant.setup
}

function getExerciseSets(entry: SessionExercise, variant: ExerciseVariant) {
  return entry.sets ?? variant.sets
}

function getExerciseReps(entry: SessionExercise, variant: ExerciseVariant) {
  return entry.reps ?? variant.reps
}

function updateSessionEntry(
  session: WorkoutSession,
  groupId: string,
  variantId: string,
  entry: SessionExercise,
): WorkoutSession {
  const groupEntry = session.groupEntries[groupId] ?? {
    activeVariantId: variantId,
    entries: {},
  }

  return {
    ...session,
    groupEntries: {
      ...session.groupEntries,
      [groupId]: {
        ...groupEntry,
        entries: {
          ...groupEntry.entries,
          [variantId]: entry,
        },
      },
    },
  }
}

function getLatestWeight(data: AppData, workoutId: WorkoutId, variantId: string) {
  const latest = data.sessions
    .filter((session) => session.workoutId === workoutId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((session) =>
      Object.values(session.groupEntries).some((groupEntry) => groupEntry.entries[variantId]?.weight !== undefined),
    )

  if (!latest) {
    return null
  }

  const entry = Object.values(latest.groupEntries).find((groupEntry) => groupEntry.entries[variantId]?.weight !== undefined)
  return entry?.entries[variantId].weight ?? null
}

function getPreviousResult(
  data: AppData,
  workoutId: WorkoutId,
  session: WorkoutSession,
  groupId: string,
  variantId: string,
): PreviousResult {
  const target = findPreviousTarget(data, workoutId, session, groupId, variantId)

  if (target.sessionId) {
    const previousSession = data.sessions.find((candidate) => candidate.id === target.sessionId)
    return previousSession?.groupEntries[groupId]?.entries[variantId]?.result ?? 'missing'
  }

  return data.baselineResults[variantId] ?? 'missing'
}

function findPreviousTarget(
  data: AppData,
  workoutId: WorkoutId,
  session: WorkoutSession,
  groupId: string,
  variantId: string,
) {
  // Reach back to the last session where THIS variant was actually performed (has a logged result),
  // not merely one where an entry exists — every variant gets a carried-forward entry each session, so
  // matching on the entry alone would always return the immediately-previous session. This is what
  // makes a swap show its own real last result, even if that was many sessions ago.
  const previous = data.sessions
    .filter((candidate) => candidate.workoutId === workoutId && candidate.createdAt < session.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((candidate) => candidate.groupEntries[groupId]?.entries[variantId]?.result)

  return previous ? { sessionId: previous.id } : { sessionId: null }
}

// Counts over the displayed slots (a linked pair counts once — the visible member), so progress
// matches what's actually on the workout screen.
function countDone(session: WorkoutSession) {
  return displayedGroups(getWorkout(session.workoutId).groups).filter(({ group }) => {
    const groupEntry = session.groupEntries[group.id]
    return Boolean(groupEntry?.entries[group.activeVariantId]?.result)
  }).length
}

// A session is "finished" when every displayed exercise has a logged result (done or failed);
// otherwise the workout was left part-way. Used for the green/red status across history and tracker.
function isSessionFinished(session: WorkoutSession) {
  const total = displayedGroups(getWorkout(session.workoutId).groups).length
  return total > 0 && countDone(session) === total
}

type DaySession = { status: 'done' | 'unfinished'; sessionId: string; createdAt: number }
type DayCell = { key: string; label: string; sessions: DaySession[] }

// The last 28 days (4 rows × 7 columns), today first (top-left). Each day holds every session done
// that day (latest first, matching the history list order) so the cell stacks their colours
// top-down the same way. The session ids let a tap scroll to that day's entry.
function buildTrackerDays(sessions: WorkoutSession[]): DayCell[] {
  const byDay = new Map<string, DaySession[]>()
  for (const session of sessions) {
    const key = dayKey(session.createdAt)
    const arr = byDay.get(key) ?? []
    arr.push({
      status: isSessionFinished(session) ? 'done' : 'unfinished',
      sessionId: session.id,
      createdAt: session.createdAt,
    })
    byDay.set(key, arr)
  }

  const today = new Date()
  const days: DayCell[] = []
  for (let i = 0; i < 28; i += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const key = dayKey(date.getTime())
    const label = i === 0 ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
    const daySessions = (byDay.get(key) ?? []).sort((a, b) => b.createdAt - a.createdAt)
    days.push({ key, label, sessions: daySessions })
  }
  return days
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function getNextPendingGroupId(session: WorkoutSession, currentGroupId: string) {
  // Advance only through the slots actually shown on the workout screen (visible members of linked
  // pairs, no hidden exercises), in display order.
  const slots = displayedGroups(getWorkout(session.workoutId).groups)
  return nextPendingId(slots.map(({ group }) => group.id), currentGroupId, (groupId) => {
    const group = slots.find(({ group: candidate }) => candidate.id === groupId)?.group
    if (!group) {
      return true
    }
    const groupEntry = session.groupEntries[group.id]
    return Boolean(groupEntry?.entries[group.activeVariantId]?.result)
  })
}

function guidanceSentence(previous: PreviousResult) {
  if (previous === 'success') {
    return 'Last result: done. Increase today.'
  }

  if (previous === 'failure') {
    return 'Last result: failed. Repeat today.'
  }

  return "No previous result. Choose today's weight."
}

function guidanceClass(previous: PreviousResult) {
  if (previous === 'success') {
    return 'increase'
  }

  if (previous === 'failure') {
    return 'repeat'
  }

  return 'none'
}

function resultLabel(result: ResultStatus | undefined) {
  if (result === 'success') {
    return 'Done'
  }

  if (result === 'failure') {
    return 'Failed'
  }

  return 'Not marked'
}

function categoryLabel(category: Category) {
  const labels: Record<Category, string> = {
    CHEST: 'Chest',
    BACK: 'Back',
    SHOULDERS: 'Shoulders',
    BICEPS: 'Biceps',
    TRICEPS: 'Triceps',
    CORE: 'Core',
    LEGS: 'Legs',
  }

  return labels[category]
}

function syncStatusLabel(status: SyncStatus) {
  if (status === 'checking') {
    return 'Checking…'
  }
  if (status === 'syncing') {
    return 'Syncing…'
  }
  if (status === 'synced') {
    return 'Synced'
  }
  if (status === 'error') {
    return 'Sync paused'
  }
  if (status === 'conflict') {
    return 'Choose data'
  }
  return 'Offline'
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Cloud connection failed.'
}

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function removeKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100
}

function formatWeight(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value} kg`
}

function formatSetup(setup: string) {
  return setup.trim() || '—'
}

function formatTarget(sets: number, reps: number) {
  return `${sets}×${reps}`
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) {
    return 'just now'
  }
  if (mins < 60) {
    return plural(mins, 'minute')
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return plural(hours, 'hour')
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return plural(days, 'day')
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return plural(months, 'month')
  }
  return plural(Math.floor(days / 365), 'year')
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

// Workout length from start to the final Done/Failed — "52 min" or "1h 24m".
function formatDuration(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) {
    return `${mins} min`
  }
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

// Full weekday + date for the home header — e.g. "Tuesday 2 July".
function formatMenuDate() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now())
}

// Weekday, day, month and time — e.g. "Tue 24 Jun, 19:40". Shown alongside the relative label.
function formatAbsolute(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export default App
