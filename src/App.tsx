import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import './App.css'
import './workout.css'
import './home.css'
import './chrome.css'
import './edit.css'
import { loadCloudState, saveCloudState, supabase } from './cloud'
import {
  chooseSyncDirection,
  hasMeaningfulLocalData,
  initialLocalTimestamp,
  nextLocalTimestamp,
  parseCloudTimestamp,
} from './cloudSync'
import {
  clampRestSeconds,
  clampRestValue,
  moveItem,
  nextPendingId,
  restSecondsRemaining,
  selectActiveVariantId,
  toggleResult,
} from './domain'
import { isRecord, isValidBackup, isValidSessions, isValidTemplates } from './dataValidation'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { cancelRestNotification, scheduleRestNotification } from './restNotifications'
import { fetchLatestApkVersion } from './apkVersion'

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
}

type ExerciseGroup = {
  id: string
  activeVariantId: string
  variants: ExerciseVariant[]
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
}

type SessionGroup = {
  activeVariantId: string
  entries: Record<string, SessionExercise>
}

type WorkoutSession = {
  id: string
  workoutId: WorkoutId
  createdAt: number
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
}

type SetupDialog = {
  sessionId: string
  groupId: string
  variantId: string
  value: string
}

type TargetDialog = {
  sessionId: string
  groupId: string
  variantId: string
  sets: string
  reps: string
}

type NameDialog = {
  sessionId: string
  groupId: string
  variantId: string
  value: string
}

type PreviousDialog = {
  workoutId: WorkoutId
  sessionId: string
  groupId: string
  variantId: string
}

type ExerciseDialog = {
  workoutId: WorkoutId
  sessionId?: string
  groupId?: string
  variantId?: string
  name: string
  category: Category
  sets: string
  reps: string
  setup: string
  weight: string
  perHand: boolean
}

type AuthDialog = {
  mode: 'in' | 'up'
  email: string
  password: string
  error: string
  note: string
  busy: boolean
}

type CloudUser = {
  id: string
  email: string
}

type SyncStatus = 'idle' | 'checking' | 'syncing' | 'synced' | 'error'

const STORAGE_KEY = 'fitness-hub-v1'
const LOCAL_UPDATED_KEY = 'fitness-hub-v1-updated-at'
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
        name: 'Incline DB chest press',
        category: 'CHEST',
        setup: '20°',
        sets: 4,
        reps: 7,
        weight: 32,
        perHand: true,
        lastResult: 'success',
      }),
      singleExercise({
        id: 'chest-supported-row-machine',
        name: 'Chest-supported row machine',
        category: 'BACK',
        setup: '5-top',
        sets: 4,
        reps: 7,
        weight: 45,
        perHand: true,
        lastResult: 'success',
      }),
      singleExercise({
        id: 'cable-lateral-raise',
        name: 'Cable lateral raise',
        category: 'SHOULDERS',
        setup: 'bottom',
        sets: 3,
        reps: 15,
        weight: 2.5,
        perHand: false,
        lastResult: 'failure',
      }),
      singleExercise({
        id: 'technogym-preacher-curl-machine',
        name: 'Technogym preacher curl machine',
        category: 'BICEPS',
        setup: '6-top',
        sets: 3,
        reps: 11,
        weight: 13.75,
        perHand: false,
        lastResult: 'success',
      }),
      singleExercise({
        id: 'overhead-cable-triceps-extension',
        name: 'Overhead cable triceps extension',
        category: 'TRICEPS',
        setup: '15',
        sets: 3,
        reps: 11,
        weight: 10,
        perHand: false,
        lastResult: 'success',
      }),
      singleExercise({
        id: 'ab-wheel',
        name: 'Ab wheel',
        category: 'CORE',
        setup: '',
        sets: 3,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'failure',
      }),
    ],
  },
  {
    id: 'workout-b',
    name: 'Workout B',
    groups: [
      singleExercise({
        id: 'weighted-dips',
        name: 'Weighted dips',
        category: 'TRICEPS',
        setup: '',
        sets: 4,
        reps: 7,
        weight: 15,
        perHand: false,
        lastResult: 'failure',
      }),
      singleExercise({
        id: 'technogym-lat-pulldown',
        name: 'Technogym lat pulldown',
        category: 'BACK',
        setup: '7-top',
        sets: 4,
        reps: 7,
        weight: 43.75,
        perHand: false,
        lastResult: 'success',
      }),
      singleExercise({
        id: 'overhead-db-shoulder-press',
        name: 'Overhead DB shoulder press',
        category: 'SHOULDERS',
        setup: '',
        sets: 3,
        reps: 9,
        weight: 20,
        perHand: true,
        lastResult: 'failure',
      }),
      {
        id: 'chest-fly-group',
        activeVariantId: 'seated-cable-chest-fly',
        variants: [
          {
            id: 'seated-cable-chest-fly',
            name: 'Seated cable chest fly',
            category: 'CHEST',
            setup: '16',
            sets: 3,
            reps: 11,
            weight: 7.5,
            perHand: false,
            lastResult: 'failure',
          },
          {
            id: 'pec-deck-machine-chest-fly',
            name: 'Pec deck machine chest fly',
            category: 'CHEST',
            setup: '9',
            sets: 3,
            reps: 11,
            weight: 10,
            perHand: false,
            lastResult: 'success',
          },
        ],
      },
      {
        id: 'reverse-fly-group',
        activeVariantId: 'reverse-cable-flyes',
        variants: [
          {
            id: 'reverse-cable-flyes',
            name: 'Reverse cable flyes',
            category: 'SHOULDERS',
            setup: '22',
            sets: 3,
            reps: 11,
            weight: 2.5,
            perHand: false,
            lastResult: 'failure',
          },
          {
            id: 'reverse-pec-deck-machine',
            name: 'Reverse pec deck machine',
            category: 'SHOULDERS',
            setup: '3',
            sets: 3,
            reps: 11,
            weight: 10,
            perHand: false,
            lastResult: 'success',
          },
        ],
      },
      singleExercise({
        id: 'bulgarian-split-squat',
        name: 'Bulgarian split squat',
        category: 'LEGS',
        setup: '',
        sets: 3,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'failure',
      }),
    ],
  },
]

function singleExercise(variant: ExerciseVariant): ExerciseGroup {
  return {
    id: variant.id,
    activeVariantId: variant.id,
    variants: [variant],
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
    default:
      return null
  }
}

function App() {
  const [data, setData] = useState<AppData>(loadData)
  templatesRef = data.templates
  const [screen, setScreenState] = useState<Screen>(loadScreen)
  const [screenStack, setScreenStack] = useState<Screen[]>([])
  const [weightDialog, setWeightDialog] = useState<WeightDialog | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [setupDialog, setSetupDialog] = useState<SetupDialog | null>(null)
  const [targetDialog, setTargetDialog] = useState<TargetDialog | null>(null)
  const [previousDialog, setPreviousDialog] = useState<PreviousDialog | null>(null)
  const [exerciseDialog, setExerciseDialog] = useState<ExerciseDialog | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [cloudActionBusy, setCloudActionBusy] = useState(false)
  const [cloudActionError, setCloudActionError] = useState('')
  const [authDialog, setAuthDialog] = useState<AuthDialog | null>(null)
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS)
  const [restRunning, setRestRunning] = useState(false)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restPulse, setRestPulse] = useState(false)
  const [restNotificationMessage, setRestNotificationMessage] = useState('')
  const [vibrationMessage, setVibrationMessage] = useState('')
  const [latestApkVersion, setLatestApkVersion] = useState<string | null>(null)
  const [restDraft, setRestDraft] = useState<string | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [highlightSession, setHighlightSession] = useState<string | null>(null)
  const scrollTimer = useRef<number | null>(null)
  const pulseTimer = useRef<number | null>(null)
  const syncTimer = useRef<number | null>(null)
  const scrollPositionsRef = useRef(data.scrollBySession)
  scrollPositionsRef.current = data.scrollBySession
  // Mirror the current screen into a ref so the (mount-only) popstate handler can read it.
  const screenRef = useRef(screen)
  screenRef.current = screen
  // Dismissable "back layers" stacked on top of a screen: edit mode and any open dialog. The back
  // gesture closes the topmost one before leaving the screen. We mirror their open-state into refs
  // and a count so the mount-only history handler can read the latest values.
  const dialogOpen =
    weightDialog !== null ||
    nameDialog !== null ||
    setupDialog !== null ||
    targetDialog !== null ||
    previousDialog !== null ||
    exerciseDialog !== null ||
    authDialog !== null ||
    startDialogOpen
  const overlayCount = (editMode ? 1 : 0) + (dialogOpen ? 1 : 0)
  const editModeRef = useRef(editMode)
  editModeRef.current = editMode
  const dialogOpenRef = useRef(dialogOpen)
  dialogOpenRef.current = dialogOpen
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
      localStorage.getItem(LOCAL_UPDATED_KEY),
      hasMeaningfulLocalData(data, initialData),
      Date.now(),
    )
  })
  const localUpdatedAtRef = useRef(initialSyncTimestamp)

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
      }
    }, SYNC_DEBOUNCE_MS)
  }

  useEffect(() => {
    let active = true
    void fetchLatestApkVersion().then((version) => {
      if (active && version) {
        setLatestApkVersion(version)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

    if (lastPersistedDataRef.current === data) {
      return
    }
    lastPersistedDataRef.current = data

    const remoteTimestamp = applyingRemoteTimestampRef.current
    if (remoteTimestamp !== null) {
      applyingRemoteTimestampRef.current = null
      localUpdatedAtRef.current = remoteTimestamp
      localStorage.setItem(LOCAL_UPDATED_KEY, String(remoteTimestamp))
      return
    }

    const updatedAt = nextLocalTimestamp(localUpdatedAtRef.current, Date.now())
    localUpdatedAtRef.current = updatedAt
    localStorage.setItem(LOCAL_UPDATED_KEY, String(updatedAt))
    queueCloudPushRef.current()
  }, [data])

  useEffect(() => {
    if (localUpdatedAtRef.current > 0 && !localStorage.getItem(LOCAL_UPDATED_KEY)) {
      localStorage.setItem(LOCAL_UPDATED_KEY, String(localUpdatedAtRef.current))
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
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      updateCloudUser(session?.user)
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
      return
    }

    let cancelled = false
    setSyncStatus('checking')
    setSyncError('')

    const syncOnSignIn = async () => {
      try {
        const remote = await loadCloudState(cloudUserId)
        if (cancelled) {
          return
        }

        const remoteUpdatedAt = remote ? parseCloudTimestamp(remote.updatedAt) : null
        if (remote && remoteUpdatedAt === null) {
          throw new Error('Cloud data has an invalid timestamp.')
        }

        const localUpdatedAt = localUpdatedAtRef.current
        if (remote && remoteUpdatedAt !== null && chooseSyncDirection(remoteUpdatedAt, localUpdatedAt) === 'pull') {
          if (!isValidBackup(remote.data)) {
            throw new Error('Cloud data is invalid. Your local data was kept safe.')
          }

          applyingRemoteTimestampRef.current = remoteUpdatedAt
          localUpdatedAtRef.current = remoteUpdatedAt
          localStorage.setItem(LOCAL_UPDATED_KEY, String(remoteUpdatedAt))
          syncReadyRef.current = true
          setData(normalizeData(remote.data))
          setSyncStatus('synced')
          return
        }

        const pushedAt = Math.max(localUpdatedAt, Date.now())
        localUpdatedAtRef.current = pushedAt
        localStorage.setItem(LOCAL_UPDATED_KEY, String(pushedAt))
        await saveCloudState(cloudUserId, dataRef.current, pushedAt)
        if (cancelled) {
          return
        }

        syncReadyRef.current = true
        if (localUpdatedAtRef.current > pushedAt) {
          queueCloudPushRef.current()
        } else {
          setSyncStatus('synced')
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus('error')
          setSyncError(errorMessage(error))
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

    // The app reloads the page on each launch (the Android wrapper loads the live site), so it can
    // start on a restored sub-screen with an empty stack. Seed a back step to the menu so the
    // first back gesture returns there instead of immediately exiting the app.
    if (screenRef.current.name !== 'main') {
      setScreenStack([{ name: 'main' }])
      window.history.pushState({ fitnessHub: true }, '')
    }

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
    setNameDialog(null)
    setSetupDialog(null)
    setTargetDialog(null)
    setPreviousDialog(null)
    setExerciseDialog(null)
    setAuthDialog(null)
    setStartDialogOpen(false)
  }

  const scrollToSession = (sessionId: string) => {
    const card = document.getElementById(`hist-${sessionId}`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightSession(sessionId)
    window.setTimeout(() => {
      setHighlightSession((current) => (current === sessionId ? null : current))
    }, 1800)
  }

  const triggerRestDone = () => {
    navigator.vibrate?.(1000)
    setRestPulse(true)

    if (pulseTimer.current !== null) {
      window.clearTimeout(pulseTimer.current)
    }

    pulseTimer.current = window.setTimeout(() => setRestPulse(false), 1100)
  }

  const renderMain = () => {
    const latest = sortedSessions[0]
    const resumable =
      latest && countDone(latest) < getWorkout(latest.workoutId).groups.length ? latest : undefined
    const lastWorkoutId = latest?.workoutId
    const suggestedId: WorkoutId = lastWorkoutId === 'workout-a' ? 'workout-b' : 'workout-a'
    const otherWorkouts = data.templates.filter((template) => template.id !== suggestedId)
    const sessionCount = data.sessions.length

    return (
      <main className="home" aria-label="Fitness Hub">
        <header className="home-top">
          <h1>Fitness Hub</h1>
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
              {getWorkout(resumable.workoutId).name} · {countDone(resumable)} of {getWorkout(resumable.workoutId).groups.length} done
            </span>
            <span className="home-rail" aria-hidden="true">
              {getWorkout(resumable.workoutId).groups.map((group) => {
                const groupEntry = resumable.groupEntries[group.id]
                const result = groupEntry?.entries[groupEntry.activeVariantId]?.result
                return <i className={result === 'success' ? 'done' : result === 'failure' ? 'failed' : ''} key={group.id} />
              })}
            </span>
          </button>
        )}

        <button className="home-start-primary" type="button" onClick={() => setStartDialogOpen(true)}>
          <span className="home-start-main">
            <strong>Start new workout</strong>
            <small>Up next · {getWorkout(suggestedId).name}</small>
          </span>
          <Icon name="forward" size={24} />
        </button>

        <div className="home-tiles">
          <button className="home-tile" type="button" onClick={() => navigate({ name: 'global-history' })}>
            <span className="home-tile-icon"><Icon name="history" size={22} /></span>
            <span className="home-tile-text">
              <span>History</span>
              <small>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</small>
            </span>
          </button>
          <button className="home-tile" type="button" onClick={() => navigate({ name: 'settings' })}>
            <span className="home-tile-icon"><Icon name="settings" size={22} /></span>
            <span className="home-tile-text">
              <span>Settings</span>
              <small>Backup, reset</small>
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
                  <p className="start-or">Or pick another</p>
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

              <button className="start-cancel" type="button" onClick={() => setStartDialogOpen(false)}>
                Cancel
              </button>
            </div>
          </Dialog>
        )}
      </main>
    )
  }

  const renderHistory = (sessions: WorkoutSession[], onBack: () => void, title = 'History') => {
    const tracker = buildTwoWeekTracker(sessions)
    return (
      <Page title={title} onBack={onBack}>
        {sessions.length === 0 ? (
          <EmptyState text="No sessions yet." />
        ) : (
          <>
            <div className="hist-tracker" aria-label="Last 14 days">
              <div className="hist-tracker-row">
                {tracker.map((day) => {
                  const latest = day.sessions[0]
                  const label = day.sessions.length
                    ? `${day.label} · ${day.sessions.map((s) => (s.status === 'done' ? 'finished' : 'unfinished')).join(', ')}`
                    : `${day.label} · rest day`
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
                <span><i className="dot done" />Finished</span>
                <span><i className="dot unfinished" />Unfinished</span>
                <span className="hist-tracker-ends">today → 2 weeks</span>
              </div>
            </div>

            <div className="hist-list">
              {sessions.map((session) => {
                const workout = getWorkout(session.workoutId)
                const doneCount = countDone(session)
                const total = workout.groups.length
                const finished = doneCount === total
                return (
                  <article
                    className={`hist-card ${highlightSession === session.id ? 'highlight' : ''}`}
                    id={`hist-${session.id}`}
                    key={session.id}
                  >
                    <button className="hist-open" type="button" onClick={() => openSession(session.workoutId, session.id)}>
                      <span className="hist-main">
                        <strong>{workout.name}</strong>
                        <small>{formatAbsolute(session.createdAt)}</small>
                        <small className="hist-ago">{formatRelative(session.createdAt)}</small>
                      </span>
                      <span className={`hist-chip ${finished ? 'done' : 'unfinished'}`}>
                        {finished ? 'Done' : 'Unfinished'}
                        <em>{doneCount}/{total}</em>
                      </span>
                    </button>
                    <button className="hist-del" type="button" aria-label="Delete session" onClick={() => deleteSession(session.id)}>
                      <Icon name="trash" size={18} />
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
      return
    }

    setAuthDialog({ ...authDialog, busy: true, error: '', note: '' })

    if (authDialog.mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setAuthDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
      } else {
        setAuthDialog(null)
      }
      return
    }

    const { data: signUpData, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setAuthDialog((current) => (current ? { ...current, busy: false, error: error.message } : current))
    } else if (signUpData.session) {
      setAuthDialog(null)
    } else {
      setAuthDialog((current) =>
        current
          ? { ...current, mode: 'in', password: '', busy: false, error: '', note: 'Account created. Confirm via the email we sent, then sign in.' }
          : current,
      )
    }
  }

  const retryCloudSync = () => {
    setCloudActionError('')
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
      setCloudActionError(`Could not sign out. ${error.message}`)
      return
    }

    setCloudActionBusy(false)
    setCloudUser(null)
  }

  const renderSettings = () => (
    <Page title="Settings" onBack={() => goBack({ name: 'main' })}>
      <div className="set-list">
        {supabase &&
          (cloudUser ? (
            <div className="set-row set-cloud">
              <span className="set-main">
                <strong>Cloud sync</strong>
                <small>Signed in as {cloudUser.email}</small>
                <span className={`sync-status ${syncStatus}`} aria-live="polite">
                  <i aria-hidden="true" />
                  {syncStatusLabel(syncStatus)}
                </span>
                {syncStatus === 'error' && <span className="cloud-error">{syncError}</span>}
                {cloudActionError && <span className="cloud-error" role="alert">{cloudActionError}</span>}
              </span>
              <span className="set-cloud-actions">
                {syncStatus === 'error' && (
                  <button className="set-pill retry" type="button" onClick={retryCloudSync}>
                    Retry
                  </button>
                )}
                <button className="set-pill" type="button" onClick={signOut} disabled={cloudActionBusy}>
                  {cloudActionBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </span>
            </div>
          ) : (
            <button
              className="set-row"
              type="button"
              onClick={() => setAuthDialog({ mode: 'in', email: '', password: '', error: '', note: '', busy: false })}
            >
              <span className="set-main">
                <strong>Sign in to sync</strong>
                <small>Back up and sync across your devices</small>
              </span>
              <Icon name="cloud" />
            </button>
          ))}

        <a
          className="set-row set-link"
          href="https://github.com/echoNad3/fitness_hub/releases/latest/download/app-debug.apk"
          target="_blank"
          rel="noreferrer noopener"
        >
          <span className="set-main">
            <strong>Download the Android app</strong>
            <small>
              {latestApkVersion
                ? `Latest APK — ${latestApkVersion}. Reinstall to update.`
                : 'Latest APK. Reinstall to get the newest version.'}
            </small>
          </span>
          <Icon name="download" />
        </a>

        <button className="set-row" type="button" onClick={exportData}>
          <span className="set-main">
            <strong>Export backup</strong>
            <small>Download all your data as a JSON file</small>
          </span>
          <Icon name="download" />
        </button>

        <label className="set-row">
          <span className="set-main">
            <strong>Import backup</strong>
            <small>Replace your data from a JSON file</small>
          </span>
          <Icon name="upload" />
          <input type="file" accept="application/json,.json" onChange={importData} />
        </label>

        <button className="set-row" type="button" onClick={testVibration}>
          <span className="set-main">
            <strong>Test vibration</strong>
            <small>{vibrationMessage || 'Buzz the phone once'}</small>
          </span>
          <Icon name="bell" />
        </button>

        <div className="set-row set-rest">
          <span className="set-main">
            <strong>Rest length</strong>
            <small>Countdown after each set</small>
          </span>
          <div className="set-stepper">
            <button type="button" aria-label="Less rest" onClick={() => changeRest(-15)}>
              <Icon name="minus" size={18} />
            </button>
            <label className="set-rest-field">
              <input
                type="number"
                inputMode="numeric"
                min={15}
                max={600}
                aria-label="Rest length in seconds"
                value={restDraft ?? String(data.restSeconds)}
                onFocus={() => setRestDraft(String(data.restSeconds))}
                onChange={(event) => setRestDraft(event.target.value)}
                onBlur={commitRestDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <span>s</span>
            </label>
            <button type="button" aria-label="More rest" onClick={() => changeRest(15)}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>

        <button className="set-row danger" type="button" onClick={resetData}>
          <span className="set-main">
            <strong>Reset app data</strong>
            <small>Clear all sessions and changes</small>
          </span>
          <Icon name="trash" />
        </button>
      </div>
      {authDialog && (
        <Dialog title={authDialog.mode === 'in' ? 'Sign in' : 'Create account'}>
          <div className="ex-form">
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
              <input
                className="number-input text-input"
                type="password"
                autoComplete={authDialog.mode === 'in' ? 'current-password' : 'new-password'}
                value={authDialog.password}
                onChange={(event) => setAuthDialog({ ...authDialog, password: event.target.value, error: '' })}
              />
            </label>
            {authDialog.error && <p className="auth-error">{authDialog.error}</p>}
            {authDialog.note && <p className="dialog-help">{authDialog.note}</p>}
            <button
              className="auth-switch"
              type="button"
              onClick={() => setAuthDialog({ ...authDialog, mode: authDialog.mode === 'in' ? 'up' : 'in', error: '', note: '' })}
            >
              {authDialog.mode === 'in' ? 'No account? Create one' : 'Have an account? Sign in'}
            </button>
            <div className="dialog-actions">
              <button type="button" onClick={() => setAuthDialog(null)}>
                Cancel
              </button>
              <button className="primary-action" type="button" disabled={authDialog.busy} onClick={submitAuth}>
                {authDialog.busy ? 'Working…' : authDialog.mode === 'in' ? 'Sign in' : 'Create account'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </Page>
  )

  const renderSession = (session: WorkoutSession) => {
    const workout = getWorkout(session.workoutId)
    const expandedGroupId = data.expandedBySession[session.id] ?? workout.groups[0]?.id ?? ''
    const doneCount = countDone(session)

    return (
      <main className="ws-screen">
        <header className="ws-header">
          <button className="ws-back" type="button" aria-label="Back" onClick={() => goBack({ name: 'main' })}>
            <Icon name="back" />
          </button>
          <div className="ws-head-title">
            <strong>{workout.name}</strong>
            <span>{doneCount}/{workout.groups.length} done</span>
          </div>
          <button
            className="ws-back ws-edit-toggle"
            type="button"
            aria-label={editMode ? 'Done editing' : 'Edit workout'}
            onClick={() => setEditMode((value) => !value)}
          >
            <Icon name={editMode ? 'check' : 'edit'} />
          </button>
          <div className="ws-rail" aria-label={`${doneCount} of ${workout.groups.length} exercises done`}>
            {workout.groups.map((group) => {
              const groupEntry = session.groupEntries[group.id]
              const result = groupEntry?.entries[groupEntry.activeVariantId]?.result
              return <i className={result === 'success' ? 'done' : result === 'failure' ? 'failed' : ''} key={group.id} />
            })}
          </div>
        </header>

        <section className="ws-list" aria-label={`${workout.name} exercises`}>
          {editMode
            ? workout.groups.map((group, index) => renderEditRow(workout, session, group, index))
            : workout.groups.map((group, index) => renderExerciseRow(workout, session, group, expandedGroupId, index))}
          {editMode && (
            <button className="ws-add" type="button" onClick={() => openExerciseEditor(workout.id, session.id)}>
              <Icon name="plus" size={18} />
              Add exercise
            </button>
          )}
        </section>

        {!editMode && renderRestTimer()}
      </main>
    )
  }

  const renderEditRow = (workout: WorkoutTemplate, session: WorkoutSession, group: ExerciseGroup, index: number) => {
    const activeVariantId = selectActiveVariantId(
      session.groupEntries[group.id]?.activeVariantId,
      data.variantPrefs[group.id],
      group.activeVariantId,
    )
    const variant = getVariant(group, activeVariantId)
    const muscle = muscleColor(variant.category)
    const isFirst = index === 0
    const isLast = index === workout.groups.length - 1

    return (
      <div className="ws-edit-row" style={{ borderColor: `${muscle}52` }} key={group.id}>
        <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
        <button className="ws-edit-main" type="button" onClick={() => openExerciseEditor(workout.id, session.id, group, activeVariantId)}>
          <strong>{variant.name}</strong>
          <small>
            {categoryLabel(variant.category)} · {variant.sets}×{variant.reps}
          </small>
        </button>
        <div className="ws-edit-actions">
          <button type="button" aria-label="Move up" disabled={isFirst} onClick={() => moveGroup(workout.id, group.id, -1)}>
            <Icon name="up" size={18} />
          </button>
          <button type="button" aria-label="Move down" disabled={isLast} onClick={() => moveGroup(workout.id, group.id, 1)}>
            <Icon name="down" size={18} />
          </button>
          <button
            className="ws-edit-del"
            type="button"
            aria-label="Remove exercise"
            disabled={workout.groups.length === 1}
            onClick={() => removeGroup(workout.id, group.id)}
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </div>
    )
  }

  const renderExerciseRow = (
    workout: WorkoutTemplate,
    session: WorkoutSession,
    group: ExerciseGroup,
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

    if (!isExpanded) {
      return (
        <button
          type="button"
          className={`ws-row${entry.result ? ' is-done' : ''}`}
          style={{ borderColor: `${muscle}52` }}
          id={`exercise-${group.id}`}
          key={group.id}
          aria-expanded={false}
          onClick={() => expandExercise(session.id, group.id)}
        >
          <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
          <span className="ws-num">{numLabel}</span>
          <span className="ws-name">{variant.name}</span>
          {entry.result ? (
            <span className={`ws-chip ${entry.result === 'success' ? 'done' : 'failed'}`}>{resultLabel(entry.result)}</span>
          ) : (
            <span className="ws-meta">{formatTarget(displaySets, displayReps)}</span>
          )}
        </button>
      )
    }

    return (
      <article className="ws-card" style={{ borderColor: `${muscle}b0` }} id={`exercise-${group.id}`} key={group.id}>
        <div className="ws-card-head">
          <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
          <span className="ws-num">{numLabel}</span>
          <button
            className="ws-card-name"
            type="button"
            onClick={() =>
              setNameDialog({ sessionId: session.id, groupId: group.id, variantId: variant.id, value: variant.name })
            }
          >
            {variant.name}
          </button>
          <span className="ws-cat" style={{ color: muscle }}>
            {categoryLabel(variant.category)}
          </span>
        </div>

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

        <div className="ws-facts">
          <button
            className="ws-fact"
            type="button"
            onClick={() =>
              setSetupDialog({ sessionId: session.id, groupId: group.id, variantId: variant.id, value: displaySetup })
            }
          >
            <span>Setup</span>
            <strong>{formatSetup(displaySetup)}</strong>
          </button>
          <button
            className="ws-fact"
            type="button"
            onClick={() =>
              setTargetDialog({
                sessionId: session.id,
                groupId: group.id,
                variantId: variant.id,
                sets: String(displaySets),
                reps: String(displayReps),
              })
            }
          >
            <span>Target</span>
            <strong>{formatTarget(displaySets, displayReps)}</strong>
          </button>
        </div>

        <div className="ws-step" aria-label={`${variant.name} weight`}>
          <button
            className="ws-stepbtn"
            type="button"
            aria-label="Decrease weight"
            onClick={() => adjustWeight(session.id, group.id, variant.id, -1.25)}
          >
            <Icon name="minus" />
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
            onClick={() => adjustWeight(session.id, group.id, variant.id, 1.25)}
          >
            <Icon name="plus" />
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

        {group.variants.length > 1 && (
          <button className="ws-swap" type="button" onClick={() => swapVariant(session.id, group)}>
            Swap to {getNextVariant(group, variant.id).name}
          </button>
        )}
      </article>
    )
  }

  const renderRestTimer = () => (
    <section className={`ws-dock${restRunning ? ' running' : ''}${restPulse ? ' pulse' : ''}`} aria-label="Rest timer">
      {restRunning ? (
        <>
          <div className="ws-dock-time">
            <span className="ws-dock-left">
              <Icon name="clock" size={18} />
              Rest
            </span>
            <strong>{formatTimer(restSeconds)}</strong>
          </div>
          <button
            className="ws-dock-cancel"
            type="button"
            onClick={() => {
              setRestRunning(false)
              setRestEndsAt(null)
              setRestSeconds(data.restSeconds)
              setRestNotificationMessage('')
              void cancelRestNotification()
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="ws-dock-start"
          type="button"
          onClick={() => {
            const endsAt = Date.now() + data.restSeconds * 1000
            setRestSeconds(data.restSeconds)
            setRestEndsAt(endsAt)
            setRestRunning(true)
            setRestNotificationMessage('')
            void scheduleRestNotification(endsAt).then((result) => {
              if (result.status === 'outdated') {
                setRestNotificationMessage(
                  'Locked-screen buzz needs an app update — reinstall the latest APK. The visible timer still works.',
                )
              } else if (result.status === 'failed') {
                setRestNotificationMessage(
                  `Locked-screen buzz unavailable${result.detail ? ` (${result.detail})` : ''}. The visible timer still works.`,
                )
              }
            })
          }}
        >
          <span className="ws-dock-left">
            <Icon name={restPulse ? 'check' : 'clock'} size={18} />
            {restPulse ? 'Rest done' : 'Rest timer'}
          </span>
          <strong>{restPulse ? '' : `Start · ${data.restSeconds}s`}</strong>
        </button>
      )}
      {restNotificationMessage && (
        <small className="ws-dock-note" role="status">
          {restNotificationMessage}
        </small>
      )}
    </section>
  )

  const openSession = (workoutId: WorkoutId, sessionId: string) => {
    setData((current) => ({
      ...current,
      currentSessionByWorkout: {
        ...current.currentSessionByWorkout,
        [workoutId]: sessionId,
      },
    }))
    setEditMode(false)
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
    navigate({ name: 'session', workoutId, sessionId })
  }

  const moveGroup = (workoutId: WorkoutId, groupId: string, direction: -1 | 1) => {
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) => {
        if (template.id !== workoutId) {
          return template
        }
        const groups = moveItem(template.groups, groupId, direction)
        if (groups === template.groups) {
          return template
        }
        return { ...template, groups }
      }),
    }))
  }

  const removeGroup = (workoutId: WorkoutId, groupId: string) => {
    const workout = data.templates.find((template) => template.id === workoutId)
    if (!workout || workout.groups.length <= 1) {
      return
    }

    if (!window.confirm('Remove this exercise from the workout?')) {
      return
    }

    setData((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === workoutId ? { ...template, groups: template.groups.filter((group) => group.id !== groupId) } : template,
      ),
    }))
  }

  const addExercise = (workoutId: WorkoutId, variant: ExerciseVariant) => {
    setData((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === workoutId
          ? { ...template, groups: [...template.groups, { id: variant.id, activeVariantId: variant.id, variants: [variant] }] }
          : template,
      ),
      baselineResults: { ...current.baselineResults, [variant.id]: variant.lastResult },
    }))
  }

  const openExerciseEditor = (workoutId: WorkoutId, sessionId?: string, group?: ExerciseGroup, activeVariantId?: string) => {
    if (group) {
      const variant = getVariant(
        group,
        selectActiveVariantId(activeVariantId, data.variantPrefs[group.id], group.activeVariantId),
      )
      setExerciseDialog({
        workoutId,
        sessionId,
        groupId: group.id,
        variantId: variant.id,
        name: variant.name,
        category: variant.category,
        sets: String(variant.sets),
        reps: String(variant.reps),
        setup: variant.setup,
        weight: String(variant.weight),
        perHand: variant.perHand,
      })
    } else {
      setExerciseDialog({ workoutId, sessionId, name: '', category: 'CHEST', sets: '3', reps: '10', setup: '', weight: '0', perHand: false })
    }
  }

  const saveExercise = () => {
    if (!exerciseDialog) {
      return
    }

    const name = exerciseDialog.name.trim()
    const sets = Number(exerciseDialog.sets)
    const reps = Number(exerciseDialog.reps)
    const weight = Number(exerciseDialog.weight)
    if (!name || !Number.isInteger(sets) || sets < 1 || !Number.isInteger(reps) || reps < 1 || !Number.isFinite(weight) || weight < 0) {
      return
    }

    const setup = exerciseDialog.setup.trim()
    if (exerciseDialog.groupId && exerciseDialog.variantId) {
      updateTemplateVariant(exerciseDialog.variantId, {
        name,
        category: exerciseDialog.category,
        sets,
        reps,
        setup,
        weight: roundWeight(weight),
        perHand: exerciseDialog.perHand,
      })
      if (exerciseDialog.sessionId) {
        updateExerciseEntry(exerciseDialog.sessionId, exerciseDialog.groupId, exerciseDialog.variantId, (entry) => ({
          ...entry,
          setup,
          sets,
          reps,
          weight: roundWeight(weight),
        }))
      }
    } else {
      addExercise(exerciseDialog.workoutId, {
        id: createId(),
        name,
        category: exerciseDialog.category,
        setup,
        sets,
        reps,
        weight: roundWeight(weight),
        perHand: exerciseDialog.perHand,
        lastResult: 'missing',
      })
    }

    setExerciseDialog(null)
  }

  const changeRest = (delta: number) => {
    setData((current) => ({
      ...current,
      restSeconds: clampRestSeconds(current.restSeconds, delta),
    }))
  }

  const commitRestDraft = () => {
    setRestDraft((draft) => {
      if (draft !== null && draft.trim() !== '') {
        const next = clampRestValue(Number(draft))
        setData((current) => ({ ...current, restSeconds: next }))
      }
      return null
    })
  }

  const deleteSession = (sessionId: string) => {
    if (!window.confirm('Delete this session?')) {
      return
    }

    setData((current) => ({
      ...current,
      sessions: current.sessions.filter((session) => session.id !== sessionId),
      expandedBySession: removeKey(current.expandedBySession, sessionId),
      scrollBySession: removeKey(current.scrollBySession, sessionId),
      currentSessionByWorkout: Object.fromEntries(
        Object.entries(current.currentSessionByWorkout).filter(([, value]) => value !== sessionId),
      ) as Partial<Record<WorkoutId, string>>,
    }))
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

  const adjustWeight = (sessionId: string, groupId: string, variantId: string, delta: number) => {
    updateExerciseEntry(sessionId, groupId, variantId, (entry) => ({
      ...entry,
      weight: roundWeight(Math.max(0, entry.weight + delta)),
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
        updatedSession = updateSessionEntry(session, groupId, variantId, {
          ...entry,
          result: nextResult,
        })
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
  }

  const swapVariant = (sessionId: string, group: ExerciseGroup) => {
    setData((current) => {
      const sessions = current.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session
        }

        const groupEntry = ensureSessionGroup(session, group, current)
        const nextVariant = getNextVariant(group, groupEntry.activeVariantId)
        return {
          ...session,
          groupEntries: {
            ...session.groupEntries,
            [group.id]: {
              ...groupEntry,
              activeVariantId: nextVariant.id,
              entries: {
                ...groupEntry.entries,
                [nextVariant.id]: groupEntry.entries[nextVariant.id] ?? createSessionEntry(current, session.workoutId, nextVariant),
              },
            },
          },
        }
      })

      const changedSession = sessions.find((session) => session.id === sessionId)
      const changedGroup = changedSession?.groupEntries[group.id]

      return {
        ...current,
        sessions,
        variantPrefs: changedGroup
          ? {
              ...current.variantPrefs,
              [group.id]: changedGroup.activeVariantId,
            }
          : current.variantPrefs,
      }
    })
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
      return
    }

    updateExerciseEntry(weightDialog.sessionId, weightDialog.groupId, weightDialog.variantId, (entry) => ({
      ...entry,
      weight: roundWeight(parsed),
    }))
    setWeightDialog(null)
  }

  const saveManualName = () => {
    if (!nameDialog) {
      return
    }

    const name = nameDialog.value.trim()
    if (!name) {
      return
    }

    updateTemplateVariant(nameDialog.variantId, { name })
    setNameDialog(null)
  }

  const saveManualSetup = () => {
    if (!setupDialog) {
      return
    }

    const setup = setupDialog.value.trim()
    updateTemplateVariant(setupDialog.variantId, { setup })
    updateExerciseEntry(setupDialog.sessionId, setupDialog.groupId, setupDialog.variantId, (entry) => ({
      ...entry,
      setup,
    }))
    setSetupDialog(null)
  }

  const saveManualTarget = () => {
    if (!targetDialog) {
      return
    }

    const parsedSets = Number(targetDialog.sets)
    const parsedReps = Number(targetDialog.reps)
    if (!Number.isInteger(parsedSets) || !Number.isInteger(parsedReps) || parsedSets < 1 || parsedReps < 1) {
      return
    }

    updateTemplateVariant(targetDialog.variantId, { sets: parsedSets, reps: parsedReps })
    updateExerciseEntry(targetDialog.sessionId, targetDialog.groupId, targetDialog.variantId, (entry) => ({
      ...entry,
      sets: parsedSets,
      reps: parsedReps,
    }))
    setTargetDialog(null)
  }

  const setPreviousResult = (status: PreviousResult) => {
    if (!previousDialog) {
      return
    }

    setData((current) => {
      const session = current.sessions.find((candidate) => candidate.id === previousDialog.sessionId)
      if (!session) {
        return current
      }

      const target = findPreviousTarget(current, previousDialog.workoutId, session, previousDialog.groupId, previousDialog.variantId)

      if (target.sessionId) {
        return {
          ...current,
          sessions: current.sessions.map((candidate) =>
            candidate.id === target.sessionId
              ? updateSessionEntry(candidate, previousDialog.groupId, previousDialog.variantId, {
                  ...getEntry(candidate, previousDialog.groupId, previousDialog.variantId),
                  result: status === 'missing' ? undefined : status,
                })
              : candidate,
          ),
        }
      }

      return {
        ...current,
        baselineResults: {
          ...current.baselineResults,
          [previousDialog.variantId]: status,
        },
      }
    })

    setPreviousDialog(null)
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fitness-hub-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
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
        window.alert('Data imported.')
      } catch {
        window.alert('Could not import that JSON file.')
      }
    }
    reader.readAsText(file)
  }

  const resetData = () => {
    if (!window.confirm('Reset all local Fitness Hub data?')) {
      return
    }

    setData(buildInitialData())
  }

  const testVibration = () => {
    if (!('vibrate' in navigator)) {
      setVibrationMessage('Vibration not supported here')
      return
    }

    const attempted = navigator.vibrate(1000)
    setVibrationMessage(attempted ? 'Vibration attempted' : 'Vibration blocked or unavailable')
  }

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
          <Page title="Session unavailable" onBack={() => goBack({ name: 'main' })}>
            <EmptyState text="This saved session no longer exists." />
          </Page>
        )}
        {weightDialog && (
          <Dialog title="Edit weight">
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
        {nameDialog && (
          <Dialog title="Exercise name">
            <input
              className="number-input text-input"
              inputMode="text"
              type="text"
              value={nameDialog.value}
              onChange={(event) => setNameDialog({ ...nameDialog, value: event.target.value })}
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setNameDialog(null)}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={saveManualName}>
                Save
              </button>
            </div>
          </Dialog>
        )}
        {setupDialog && (
          <Dialog title="Edit setup">
            <input
              className="number-input text-input"
              inputMode="text"
              type="text"
              placeholder="N/A, 5-top, bottom, 20°"
              value={setupDialog.value}
              onChange={(event) => setSetupDialog({ ...setupDialog, value: event.target.value })}
            />
            <p className="dialog-help">Edit the full setup note. Examples: 20°, 5-top, bottom, feet height, N/A.</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setSetupDialog(null)}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={saveManualSetup}>
                Save
              </button>
            </div>
          </Dialog>
        )}
        {targetDialog && (
          <Dialog title="Edit target">
            <div className="target-fields">
              <label>
                <span>Sets</span>
                <input
                  className="number-input"
                  inputMode="numeric"
                  type="number"
                  min="1"
                  step="1"
                  value={targetDialog.sets}
                  onChange={(event) => setTargetDialog({ ...targetDialog, sets: event.target.value })}
                />
              </label>
              <label>
                <span>Reps</span>
                <input
                  className="number-input"
                  inputMode="numeric"
                  type="number"
                  min="1"
                  step="1"
                  value={targetDialog.reps}
                  onChange={(event) => setTargetDialog({ ...targetDialog, reps: event.target.value })}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setTargetDialog(null)}>
                Cancel
              </button>
              <button className="primary-action" type="button" onClick={saveManualTarget}>
                Save
              </button>
            </div>
          </Dialog>
        )}
        {previousDialog && (
          <Dialog title="Previous session result">
            <div className="status-row dialog-status">
              <button className="success-button" type="button" onClick={() => setPreviousResult('success')}>
                Done
              </button>
              <button className="repeat-button" type="button" onClick={() => setPreviousResult('failure')}>
                Failed
              </button>
              <button className="clear-button" type="button" onClick={() => setPreviousResult('missing')}>
                Clear
              </button>
            </div>
          </Dialog>
        )}
        {exerciseDialog && (
          <Dialog title={exerciseDialog.groupId ? 'Edit exercise' : 'Add exercise'}>
            <div className="ex-form">
              <label className="ex-field">
                <span>Name</span>
                <input
                  className="number-input text-input"
                  type="text"
                  placeholder="Exercise name"
                  value={exerciseDialog.name}
                  onChange={(event) => setExerciseDialog({ ...exerciseDialog, name: event.target.value })}
                />
              </label>
              <div className="ex-field">
                <span>Muscle group</span>
                <div className="ex-muscles">
                  {CATEGORIES.map((category) => {
                    const selected = exerciseDialog.category === category
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`ex-muscle ${selected ? 'sel' : ''}`}
                        style={selected ? { background: muscleColor(category), borderColor: muscleColor(category) } : undefined}
                        onClick={() => setExerciseDialog({ ...exerciseDialog, category })}
                      >
                        {categoryLabel(category)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="ex-row2">
                <label className="ex-field">
                  <span>Sets</span>
                  <input
                    className="number-input"
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="1"
                    value={exerciseDialog.sets}
                    onChange={(event) => setExerciseDialog({ ...exerciseDialog, sets: event.target.value })}
                  />
                </label>
                <label className="ex-field">
                  <span>Reps</span>
                  <input
                    className="number-input"
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="1"
                    value={exerciseDialog.reps}
                    onChange={(event) => setExerciseDialog({ ...exerciseDialog, reps: event.target.value })}
                  />
                </label>
              </div>
              <label className="ex-field">
                <span>Setup</span>
                <input
                  className="number-input text-input"
                  type="text"
                  placeholder="20°, 5-top, N/A"
                  value={exerciseDialog.setup}
                  onChange={(event) => setExerciseDialog({ ...exerciseDialog, setup: event.target.value })}
                />
              </label>
              <div className="ex-row2">
                <label className="ex-field">
                  <span>Weight (kg)</span>
                  <input
                    className="number-input"
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="1.25"
                    value={exerciseDialog.weight}
                    onChange={(event) => setExerciseDialog({ ...exerciseDialog, weight: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className={`ex-toggle ${exerciseDialog.perHand ? 'on' : ''}`}
                  aria-pressed={exerciseDialog.perHand}
                  onClick={() => setExerciseDialog({ ...exerciseDialog, perHand: !exerciseDialog.perHand })}
                >
                  Per hand
                </button>
              </div>
              <div className="dialog-actions">
                <button type="button" onClick={() => setExerciseDialog(null)}>
                  Cancel
                </button>
                <button className="primary-action" type="button" onClick={saveExercise}>
                  Save
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </>
    )
  }

  return renderMain()
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
  // Intentionally no tap-outside-to-close: dialogs are dismissed only via their Cancel button or
  // the system back gesture (handled by the overlay history sync), so a stray tap can't discard input.
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
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
  const saved = localStorage.getItem(STORAGE_KEY)
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

  return {
    sessions: isValidSessions(partial.sessions) ? (partial.sessions as WorkoutSession[]) : [],
    variantPrefs: { ...base.variantPrefs, ...(partial.variantPrefs ?? {}) },
    templates: normalizeTemplates(value),
    baselineResults: { ...base.baselineResults, ...(partial.baselineResults ?? {}) },
    expandedBySession: partial.expandedBySession ?? {},
    scrollBySession: partial.scrollBySession ?? {},
    currentSessionByWorkout: partial.currentSessionByWorkout ?? {},
    restSeconds: typeof partial.restSeconds === 'number' && partial.restSeconds > 0 ? partial.restSeconds : DEFAULT_REST_SECONDS,
  }
}

function normalizeTemplates(value: unknown): WorkoutTemplate[] {
  const legacy = value as { templates?: unknown; variantOverrides?: Record<string, Partial<ExerciseVariant>> }
  if (isValidTemplates(legacy.templates)) {
    return legacy.templates as WorkoutTemplate[]
  }

  const templates = cloneWorkouts()
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

  return templates
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

function getNextVariant(group: ExerciseGroup, currentVariantId: string) {
  const currentIndex = group.variants.findIndex((variant) => variant.id === currentVariantId)
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % group.variants.length : 0
  return group.variants[nextIndex]
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
  const previous = data.sessions
    .filter((candidate) => candidate.workoutId === workoutId && candidate.createdAt < session.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((candidate) => candidate.groupEntries[groupId]?.entries[variantId])

  return previous ? { sessionId: previous.id } : { sessionId: null }
}

function countDone(session: WorkoutSession) {
  return getWorkout(session.workoutId).groups.filter((group) => {
    const groupEntry = session.groupEntries[group.id]
    return Boolean(groupEntry?.entries[groupEntry.activeVariantId]?.result)
  }).length
}

// A session is "finished" when every exercise has a logged result (done or failed); otherwise the
// workout was left part-way. Used for the green/red status across history and the tracker.
function isSessionFinished(session: WorkoutSession) {
  const total = getWorkout(session.workoutId).groups.length
  return total > 0 && countDone(session) === total
}

type DaySession = { status: 'done' | 'unfinished'; sessionId: string; createdAt: number }
type DayCell = { key: string; label: string; sessions: DaySession[] }

// The last 14 days, today first (left). Each day holds every session done that day (latest first,
// matching the history list order) so the cell stacks their colours top-down the same way. The
// session ids let a tap scroll to that day's entry.
function buildTwoWeekTracker(sessions: WorkoutSession[]): DayCell[] {
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
  for (let i = 0; i < 14; i += 1) {
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
  const workout = getWorkout(session.workoutId)
  return nextPendingId(workout.groups.map((group) => group.id), currentGroupId, (groupId) => {
    const group = workout.groups.find((candidate) => candidate.id === groupId)
    if (!group) {
      return true
    }
    const groupEntry = session.groupEntries[group.id]
    return Boolean(groupEntry?.entries[groupEntry.activeVariantId]?.result)
  })
}

function guidanceSentence(previous: PreviousResult) {
  if (previous === 'success') {
    return 'Last result: done. Increase today.'
  }

  if (previous === 'failure') {
    return 'Last result: failed. Repeat today.'
  }

  return 'No previous result. Choose based on feel.'
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
    return 'Checking cloud…'
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
  return 'Offline'
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Could not reach the cloud.'
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
