import { clampRestValue } from './domain.ts'
import type { ExerciseVariant } from './workoutTypes.ts'

export const MIN_PROGRAM_DAYS = 1
export const MAX_PROGRAM_DAYS = 7
export const MAX_PROGRAMS = 100
export const LEGACY_PROGRAM_ID = 'program-current'
const LEGACY_PROGRAM_CREATED_AT = 1

export type ExerciseGroup = {
  id: string
  activeVariantId: string
  variants: ExerciseVariant[]
  restSeconds: number
  hidden?: boolean
  linkId?: string
}

export type WorkoutTemplate = {
  id: string
  name: string
  groups: ExerciseGroup[]
}

export type WorkoutProgram = {
  id: string
  name: string
  workoutIds: string[]
  createdAt: number
}

type SessionEntryLike = {
  weight: number
  setup?: string
  sets?: number
  reps?: number
  perHand?: boolean
}

type SessionLike = {
  workoutId: string
  groupEntries: Record<string, { activeVariantId: string; entries: Record<string, SessionEntryLike> }>
  programId?: string
  programName?: string
  workoutName?: string
  workoutSnapshot?: WorkoutTemplate
}

export function workoutNameForIndex(index: number) {
  return `Workout ${String.fromCharCode(65 + index)}`
}

export function programForWorkout(programs: readonly WorkoutProgram[], workoutId: string) {
  return programs.find((program) => program.workoutIds.includes(workoutId))
}

function isUsableProgram(value: unknown, templateIds: ReadonlySet<string>): value is WorkoutProgram {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<WorkoutProgram>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 80 &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt > 0 &&
    Array.isArray(candidate.workoutIds) &&
    candidate.workoutIds.length >= MIN_PROGRAM_DAYS &&
    candidate.workoutIds.length <= MAX_PROGRAM_DAYS &&
    new Set(candidate.workoutIds).size === candidate.workoutIds.length &&
    candidate.workoutIds.every((id) => typeof id === 'string' && templateIds.has(id))
  )
}

export function normalizeProgramState(
  value: unknown,
  templates: readonly WorkoutTemplate[],
  activeProgramId: unknown,
  now = LEGACY_PROGRAM_CREATED_AT,
) {
  const templateIds = new Set(templates.map((template) => template.id))
  const supplied = Array.isArray(value) ? value.filter((program) => isUsableProgram(program, templateIds)) : []
  const programIds = supplied.map((program) => program.id)
  const assignedWorkoutIds = supplied.flatMap((program) => program.workoutIds)
  const validSupplied =
    supplied.length > 0 &&
    supplied.length === (Array.isArray(value) ? value.length : 0) &&
    new Set(programIds).size === programIds.length &&
    new Set(assignedWorkoutIds).size === assignedWorkoutIds.length &&
    assignedWorkoutIds.length === templates.length &&
    templates.every((template) => assignedWorkoutIds.includes(template.id))

  const programs: WorkoutProgram[] = validSupplied
    ? structuredClone(supplied)
    : [{
        id: LEGACY_PROGRAM_ID,
        name: 'Current program',
        workoutIds: templates.map((template) => template.id),
        createdAt: now,
      }]
  const active =
    typeof activeProgramId === 'string' && programs.some((program) => program.id === activeProgramId)
      ? activeProgramId
      : programs[0].id

  return { programs, activeProgramId: active }
}

export function snapshotWorkoutForSession(template: WorkoutTemplate, session: SessionLike): WorkoutTemplate {
  const snapshot = structuredClone(template)
  snapshot.groups = snapshot.groups.map((group) => {
    const sessionGroup = session.groupEntries[group.id]
    return {
      ...group,
      activeVariantId: sessionGroup?.activeVariantId ?? group.activeVariantId,
      variants: group.variants.map((variant) => {
        const entry = sessionGroup?.entries[variant.id]
        return entry
          ? {
              ...variant,
              weight: entry.weight,
              setup: entry.setup ?? variant.setup,
              sets: entry.sets ?? variant.sets,
              reps: entry.reps ?? variant.reps,
              perHand: entry.perHand ?? variant.perHand,
            }
          : variant
      }),
    }
  })
  return snapshot
}

export function migrateSessionPrograms<T extends SessionLike>(
  sessions: readonly T[],
  templates: readonly WorkoutTemplate[],
  programs: readonly WorkoutProgram[],
): Array<T & Required<Pick<SessionLike, 'programId' | 'programName' | 'workoutName' | 'workoutSnapshot'>>> {
  const templateById = new Map(templates.map((template) => [template.id, template]))
  return sessions.map((session) => {
    const currentProgram =
      (session.programId && programs.find((program) => program.id === session.programId)) ||
      programForWorkout(programs, session.workoutId) ||
      programs[0]
    const currentTemplate = session.workoutSnapshot ?? templateById.get(session.workoutId)
    if (!currentTemplate) {
      throw new Error(`Workout ${session.workoutId} has no historical snapshot.`)
    }
    const snapshot = snapshotWorkoutForSession(currentTemplate, session)
    return {
      ...session,
      programId: session.programId ?? currentProgram.id,
      programName: session.programName?.trim() || currentProgram.name,
      workoutName: session.workoutName?.trim() || snapshot.name,
      workoutSnapshot: snapshot,
    }
  })
}

export function createBlankWorkout(
  index: number,
  restSeconds: number,
  createId: () => string,
): WorkoutTemplate {
  const workoutId = createId()
  const exerciseId = createId()
  const variant: ExerciseVariant = {
    id: exerciseId,
    name: 'New exercise',
    category: 'CHEST',
    setup: '',
    sets: 3,
    reps: 10,
    weight: 0,
    perHand: false,
    lastResult: 'missing',
  }
  return {
    id: workoutId,
    name: workoutNameForIndex(index),
    groups: [{
      id: exerciseId,
      activeVariantId: exerciseId,
      variants: [variant],
      restSeconds: clampRestValue(restSeconds),
    }],
  }
}

export function createProgram(
  name: string,
  dayCount: number,
  restSeconds: number,
  createId: () => string,
  now = Date.now(),
) {
  const safeDays = Math.min(MAX_PROGRAM_DAYS, Math.max(MIN_PROGRAM_DAYS, Math.round(dayCount)))
  const templates = Array.from({ length: safeDays }, (_, index) => createBlankWorkout(index, restSeconds, createId))
  const program: WorkoutProgram = {
    id: createId(),
    name: name.trim(),
    workoutIds: templates.map((template) => template.id),
    createdAt: now,
  }
  return { program, templates }
}
