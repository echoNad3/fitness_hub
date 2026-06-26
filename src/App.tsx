import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import './App.css'
import './workout.css'

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

type VariantOverride = Partial<Pick<ExerciseVariant, 'name' | 'setup' | 'sets' | 'reps'>>

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
  variantOverrides: Record<string, VariantOverride>
  baselineResults: Record<string, PreviousResult>
  expandedBySession: Record<string, string>
  scrollBySession: Record<string, number>
  currentSessionByWorkout: Partial<Record<WorkoutId, string>>
}

type Screen =
  | { name: 'main' }
  | { name: 'workouts' }
  | { name: 'workout-menu'; workoutId: WorkoutId }
  | { name: 'workout-history'; workoutId: WorkoutId }
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

const STORAGE_KEY = 'fitness-hub-v1'
const SCREEN_KEY = 'fitness-hub-v1-screen'
const REST_SECONDS = 10

const workouts: WorkoutTemplate[] = [
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
        lastResult: 'failure',
      }),
      singleExercise({
        id: 'chest-supported-row-machine',
        name: 'Chest-supported row machine',
        category: 'BACK',
        setup: '5-top',
        sets: 4,
        reps: 7,
        weight: 42.5,
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
        weight: 12.5,
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
        sets: 2,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'missing',
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
        weight: 42.5,
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
        weight: 18,
        perHand: true,
        lastResult: 'success',
      }),
      {
        id: 'chest-fly-group',
        activeVariantId: 'seated-cable-chest-fly',
        variants: [
          {
            id: 'seated-cable-chest-fly',
            name: 'Seated cable chest fly',
            category: 'CHEST',
            setup: '15',
            sets: 3,
            reps: 11,
            weight: 5,
            perHand: false,
            lastResult: 'success',
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
            lastResult: 'success',
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
        sets: 2,
        reps: 11,
        weight: 0,
        perHand: false,
        lastResult: 'missing',
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
    default:
      return null
  }
}

function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [screen, setScreenState] = useState<Screen>(loadScreen)
  const [, setScreenStack] = useState<Screen[]>([])
  const [weightDialog, setWeightDialog] = useState<WeightDialog | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [setupDialog, setSetupDialog] = useState<SetupDialog | null>(null)
  const [targetDialog, setTargetDialog] = useState<TargetDialog | null>(null)
  const [previousDialog, setPreviousDialog] = useState<PreviousDialog | null>(null)
  const [restSeconds, setRestSeconds] = useState(REST_SECONDS)
  const [restRunning, setRestRunning] = useState(false)
  const [restPulse, setRestPulse] = useState(false)
  const [vibrationMessage, setVibrationMessage] = useState('')
  const scrollTimer = useRef<number | null>(null)
  const pulseTimer = useRef<number | null>(null)
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<WorkoutId | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    localStorage.setItem(SCREEN_KEY, JSON.stringify(screen))
  }, [screen])

  useEffect(() => {
    window.history.replaceState({ fitnessHub: true }, '')

    const handlePopState = () => {
      setScreenStack((currentStack) => {
        if (currentStack.length === 0) {
          window.history.pushState({ fitnessHub: true }, '')
          return currentStack
        }

        const previous = currentStack[currentStack.length - 1]
        setScreenState(previous)
        return currentStack.slice(0, -1)
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!restRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      setRestSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(intervalId)
          setRestRunning(false)
          triggerRestDone()
          return REST_SECONDS
        }

        return seconds - 1
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [restRunning])

  useEffect(() => {
    if (screen.name !== 'session') {
      return
    }

    const savedY = data.scrollBySession[screen.sessionId] ?? 0
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
    setScreenStack((currentStack) => {
      if (currentStack.length === 0) {
        setScreenState(fallback)
        return currentStack
      }

      const previous = currentStack[currentStack.length - 1]
      setScreenState(previous)
      return currentStack.slice(0, -1)
    })
  }

  const triggerRestDone = () => {
    navigator.vibrate?.(1000)
    setRestPulse(true)

    if (pulseTimer.current !== null) {
      window.clearTimeout(pulseTimer.current)
    }

    pulseTimer.current = window.setTimeout(() => setRestPulse(false), 1100)
  }

  const renderMain = () => (
    <main className="app-shell main-shell" aria-label="Fitness Hub main menu">
      <header className="app-title">
        <h1>Fitness Hub</h1>
        <p className="screen-subtitle">Fast gym controls for the current session.</p>
      </header>

      <nav className="card-list" aria-label="Primary">
        <MenuCard icon="W" tone="workouts" label="Workouts" detail="Start or resume A / B" onClick={() => navigate({ name: 'workouts' })} />
        <MenuCard icon="H" tone="history" label="History" detail={`${data.sessions.length} saved sessions`} onClick={() => navigate({ name: 'global-history' })} />
        <MenuCard icon="S" tone="settings" label="Settings" detail="Backup, import, reset" onClick={() => navigate({ name: 'settings' })} />
      </nav>
    </main>
  )

  const renderWorkouts = () => (
    <Page title="Workouts" eyebrow="Choose" onBack={() => goBack({ name: 'main' })}>
      <div className="workout-picker">
        {workouts.map((workout) => {
          const latestSession = getLatestSession(data, workout.id)
          const isExpanded = expandedWorkoutId === workout.id

          return (
            <section className={`workout-option ${isExpanded ? 'expanded' : ''}`} key={workout.id}>
              <button
                className={`menu-card menu-${workout.id === 'workout-a' ? 'workoutA' : 'workoutB'}`}
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
              >
                <span className="menu-icon" aria-hidden="true">
                  {workout.id === 'workout-a' ? 'A' : 'B'}
                </span>
                <span>
                  <strong>{workout.name}</strong>
                  <small>{getWorkoutSessions(data, workout.id).length} sessions</small>
                </span>
              </button>

              {isExpanded && (
                <div className="workout-option-actions">
                  <button type="button" disabled={!latestSession} onClick={() => latestSession && openSession(workout.id, latestSession.id)}>
                    <span>Resume latest</span>
                    <small>{latestSession ? formatDate(latestSession.createdAt) : 'No sessions yet'}</small>
                  </button>
                  <button type="button" onClick={() => startSession(workout.id)}>
                    <span>Start new</span>
                    <small>Confirm, then autosave</small>
                  </button>
                  <button type="button" onClick={() => navigate({ name: 'workout-history', workoutId: workout.id })}>
                    <span>History</span>
                    <small>Open, edit, delete</small>
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Page>
  )

  const renderWorkoutMenu = (workoutId: WorkoutId) => {
    const workout = getWorkout(workoutId)
    const latestSession = getLatestSession(data, workoutId)

    return (
      <Page title={workout.name} eyebrow="Workout" onBack={() => goBack({ name: 'workouts' })}>
        <div className="card-list">
          <button
            className="action-card secondary"
            type="button"
            disabled={!latestSession}
            onClick={() => latestSession && openSession(workoutId, latestSession.id)}
          >
            <span>Resume latest</span>
            <small>{latestSession ? formatDate(latestSession.createdAt) : 'No sessions yet'}</small>
          </button>
          <button className="action-card primary" type="button" onClick={() => startSession(workoutId)}>
            <span>Start new</span>
            <small>Confirm, then autosave</small>
          </button>
          <button className="action-card ghost" type="button" onClick={() => navigate({ name: 'workout-history', workoutId })}>
            <span>History</span>
            <small>Open, edit, delete</small>
          </button>
        </div>
      </Page>
    )
  }

  const renderHistory = (sessions: WorkoutSession[], onBack: () => void, title = 'History') => (
    <Page title={title} eyebrow={`${sessions.length} sessions`} onBack={onBack}>
      {sessions.length === 0 ? (
        <EmptyState text="No sessions saved yet." />
      ) : (
        <div className="history-list">
          {sessions.map((session) => {
            const workout = getWorkout(session.workoutId)
            const doneCount = countDone(session)
            const status = completionStatus(doneCount, workout.groups.length)
            return (
              <article className={`history-card ${status}`} key={session.id}>
                <div>
                  <strong>{workout.name}</strong>
                  <span>{formatDate(session.createdAt)}</span>
                  <small className="progress-chip">
                    {doneCount}/{workout.groups.length} done
                  </small>
                </div>
                <div className="history-actions">
                  <button className="open-action" type="button" onClick={() => openSession(session.workoutId, session.id)}>
                    Open
                  </button>
                  <button className="delete-action" type="button" onClick={() => deleteSession(session.id)}>
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </Page>
  )

  const renderSettings = () => (
    <Page title="Settings" eyebrow="Local only" onBack={() => goBack({ name: 'main' })}>
      <div className="settings-stack">
        <button className="action-card export-action" type="button" onClick={exportData}>
          <span>Export JSON</span>
          <small>Download a backup</small>
        </button>

        <label className="action-card import-action file-card">
          <span>Import JSON</span>
          <small>Replace local data</small>
          <input type="file" accept="application/json,.json" onChange={importData} />
        </label>

        <button className="action-card utility-action" type="button" onClick={testVibration}>
          <span>Test vibration</span>
          <small>{vibrationMessage || 'Calls navigator.vibrate(1000)'}</small>
        </button>

        <button className="action-card danger reset-action" type="button" onClick={resetData}>
          <span>Reset app data</span>
          <small>Clear sessions and preferences</small>
        </button>
      </div>
    </Page>
  )

  const renderSession = (session: WorkoutSession) => {
    const workout = getWorkout(session.workoutId)
    const expandedGroupId = data.expandedBySession[session.id] ?? workout.groups[0]?.id ?? ''
    const doneCount = countDone(session)

    return (
      <main className="ws-screen">
        <header className="ws-header">
          <button className="ws-back" type="button" aria-label="Back" onClick={() => goBack({ name: 'workout-menu', workoutId: workout.id })}>
            <Icon name="back" />
          </button>
          <div className="ws-head-title">
            <strong>{workout.name}</strong>
            <span>{doneCount}/{workout.groups.length} done</span>
          </div>
          <span aria-hidden="true" />
          <div className="ws-rail" aria-label={`${doneCount} of ${workout.groups.length} exercises done`}>
            {workout.groups.map((group) => {
              const groupEntry = session.groupEntries[group.id]
              const result = groupEntry?.entries[groupEntry.activeVariantId]?.result
              return <i className={result === 'success' ? 'done' : result === 'failure' ? 'failed' : ''} key={group.id} />
            })}
          </div>
        </header>

        <section className="ws-list" aria-label={`${workout.name} exercises`}>
          {workout.groups.map((group, index) => renderExerciseRow(workout, session, group, expandedGroupId, index))}
        </section>

        {renderRestTimer()}
      </main>
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
    const variant = getVariant(group, sessionGroup.activeVariantId, data)
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
            Swap to {applyVariantOverride(data, getNextVariant(group, variant.id)).name}
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
              setRestSeconds(REST_SECONDS)
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
            setRestSeconds(REST_SECONDS)
            setRestRunning(true)
          }}
        >
          <span className="ws-dock-left">
            <Icon name={restPulse ? 'check' : 'clock'} size={18} />
            {restPulse ? 'Rest done' : 'Rest timer'}
          </span>
          <strong>{restPulse ? '' : `Start · ${REST_SECONDS}s`}</strong>
        </button>
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
    navigate({ name: 'session', workoutId, sessionId })
  }

  const startSession = (workoutId: WorkoutId) => {
    if (!window.confirm(`Start a new ${getWorkout(workoutId).name} session?`)) {
      return
    }

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
    navigate({ name: 'session', workoutId, sessionId })
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
        const nextResult = entry.result === status ? undefined : status
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

  const updateVariantOverride = (variantId: string, override: VariantOverride) => {
    setData((current) => ({
      ...current,
      variantOverrides: {
        ...current.variantOverrides,
        [variantId]: {
          ...(current.variantOverrides[variantId] ?? {}),
          ...override,
        },
      },
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

    updateVariantOverride(nameDialog.variantId, { name })
    setNameDialog(null)
  }

  const saveManualSetup = () => {
    if (!setupDialog) {
      return
    }

    const setup = setupDialog.value.trim()
    updateVariantOverride(setupDialog.variantId, { setup })
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

    updateVariantOverride(targetDialog.variantId, { sets: parsedSets, reps: parsedReps })
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
        const parsed = JSON.parse(String(reader.result))
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

  if (screen.name === 'workouts') {
    return renderWorkouts()
  }

  if (screen.name === 'workout-menu') {
    return renderWorkoutMenu(screen.workoutId)
  }

  if (screen.name === 'workout-history') {
    return renderHistory(getWorkoutSessions(data, screen.workoutId), () => goBack({ name: 'workout-menu', workoutId: screen.workoutId }), getWorkout(screen.workoutId).name)
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
          <Page title="Session unavailable" eyebrow="Missing" onBack={() => goBack({ name: 'workout-menu', workoutId: screen.workoutId })}>
            <EmptyState text="This saved session no longer exists." />
          </Page>
        )}
        {weightDialog && (
          <Dialog title="Edit weight" onClose={() => setWeightDialog(null)}>
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
          <Dialog title="Exercise name" onClose={() => setNameDialog(null)}>
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
          <Dialog title="Edit setup" onClose={() => setSetupDialog(null)}>
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
          <Dialog title="Edit target" onClose={() => setTargetDialog(null)}>
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
          <Dialog title="Previous session result" onClose={() => setPreviousDialog(null)}>
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
      </>
    )
  }

  return renderMain()
}

function MenuCard({
  icon,
  tone,
  label,
  detail,
  onClick,
}: {
  icon: string
  tone: 'workouts' | 'history' | 'settings' | 'workoutA' | 'workoutB'
  label: string
  detail: string
  onClick: () => void
}) {
  return (
    <button className={`menu-card menu-${tone}`} type="button" onClick={onClick}>
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  )
}

function Page({ title, eyebrow, onBack, children }: { title: string; eyebrow: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="app-shell page-shell">
      <header className="page-header">
        <button className="back-button inline" type="button" onClick={onBack}>
          Back
        </button>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </header>
      {children}
    </main>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
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

  workouts.forEach((workout) => {
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
    variantOverrides: {},
    baselineResults,
    expandedBySession: {},
    scrollBySession: {},
    currentSessionByWorkout: {},
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

function loadScreen(): Screen {
  const saved = localStorage.getItem(SCREEN_KEY)
  if (!saved) {
    return { name: 'main' }
  }

  try {
    return normalizeScreen(JSON.parse(saved))
  } catch {
    return { name: 'main' }
  }
}

function normalizeData(value: unknown): AppData {
  const base = buildInitialData()
  if (!value || typeof value !== 'object') {
    return base
  }

  const partial = value as Partial<AppData>

  return {
    sessions: Array.isArray(partial.sessions) ? partial.sessions : [],
    variantPrefs: { ...base.variantPrefs, ...(partial.variantPrefs ?? {}) },
    variantOverrides: partial.variantOverrides ?? {},
    baselineResults: { ...base.baselineResults, ...(partial.baselineResults ?? {}) },
    expandedBySession: partial.expandedBySession ?? {},
    scrollBySession: partial.scrollBySession ?? {},
    currentSessionByWorkout: partial.currentSessionByWorkout ?? {},
  }
}

function normalizeScreen(value: unknown): Screen {
  if (!value || typeof value !== 'object' || !('name' in value)) {
    return { name: 'main' }
  }

  const screen = value as { name?: unknown; workoutId?: unknown; sessionId?: unknown }
  if (screen.name === 'workouts' || screen.name === 'global-history' || screen.name === 'settings' || screen.name === 'main') {
    return { name: screen.name }
  }

  if ((screen.name === 'workout-menu' || screen.name === 'workout-history') && isWorkoutId(screen.workoutId)) {
    return { name: screen.name, workoutId: screen.workoutId }
  }

  if (screen.name === 'session' && isWorkoutId(screen.workoutId) && typeof screen.sessionId === 'string') {
    return { name: 'session', workoutId: screen.workoutId, sessionId: screen.sessionId }
  }

  return { name: 'main' }
}

function isWorkoutId(value: unknown): value is WorkoutId {
  return value === 'workout-a' || value === 'workout-b'
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
  const savedVariant = applyVariantOverride(data, variant)

  return {
    weight: getLatestWeight(data, workoutId, savedVariant.id) ?? savedVariant.weight,
    setup: savedVariant.setup,
    sets: savedVariant.sets,
    reps: savedVariant.reps,
  }
}

function getWorkout(workoutId: WorkoutId) {
  return workouts.find((workout) => workout.id === workoutId) ?? workouts[0]
}

function getWorkoutSessions(data: AppData, workoutId: WorkoutId) {
  return data.sessions.filter((session) => session.workoutId === workoutId).sort((a, b) => b.createdAt - a.createdAt)
}

function getLatestSession(data: AppData, workoutId: WorkoutId) {
  return getWorkoutSessions(data, workoutId)[0]
}

function getVariant(group: ExerciseGroup, variantId: string, data?: AppData) {
  const variant = group.variants.find((candidate) => candidate.id === variantId) ?? group.variants[0]
  return data ? applyVariantOverride(data, variant) : variant
}

function applyVariantOverride(data: AppData, variant: ExerciseVariant): ExerciseVariant {
  const override = data.variantOverrides[variant.id]
  return override ? { ...variant, ...override } : variant
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

function completionStatus(doneCount: number, totalCount: number) {
  if (doneCount === totalCount) {
    return 'complete'
  }

  if (doneCount === 0) {
    return 'empty'
  }

  return 'partial'
}

function getNextPendingGroupId(session: WorkoutSession, currentGroupId: string) {
  const workout = getWorkout(session.workoutId)
  const currentIndex = workout.groups.findIndex((group) => group.id === currentGroupId)
  return workout.groups.slice(currentIndex + 1).find((group) => {
    const groupEntry = session.groupEntries[group.id]
    return !groupEntry?.entries[groupEntry.activeVariantId]?.result
  })?.id
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

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export default App
