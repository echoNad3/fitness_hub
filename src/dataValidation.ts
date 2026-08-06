const CATEGORIES = new Set(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'CORE', 'LEGS'])
const PREVIOUS_RESULTS = new Set(['success', 'failure', 'missing'])
const MAX_EXERCISE_NAME_LENGTH = 80
const MAX_WORKOUT_NAME_LENGTH = 80
const MAX_SETUP_LENGTH = 120
const MAX_NOTE_LENGTH = 240
const MAX_COUNT = 999
const MAX_PROGRAMS = 100
const MAX_PROGRAM_DAYS = 7
const VARIANT_OVERRIDE_KEYS = new Set([
  'name',
  'category',
  'setup',
  'sets',
  'reps',
  'weight',
  'perHand',
  'lastResult',
  'note',
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringWithin(value: unknown, maxLength: number, allowEmpty = true) {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  )
}

function isFiniteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isValidCount(value: unknown) {
  return typeof value === 'number' && isPositiveInteger(value) && value <= MAX_COUNT
}

function isOptionalStringWithin(value: unknown, maxLength: number) {
  return value === undefined || isStringWithin(value, maxLength)
}

function isOptionalValidCount(value: unknown) {
  return value === undefined || isValidCount(value)
}

function isVariant(value: unknown) {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.id) &&
    isStringWithin(value.name, MAX_EXERCISE_NAME_LENGTH, false) &&
    typeof value.category === 'string' &&
    CATEGORIES.has(value.category) &&
    isStringWithin(value.setup, MAX_SETUP_LENGTH) &&
    isValidCount(value.sets) &&
    isValidCount(value.reps) &&
    isFiniteNonNegative(value.weight) &&
    typeof value.perHand === 'boolean' &&
    typeof value.lastResult === 'string' &&
    PREVIOUS_RESULTS.has(value.lastResult) &&
    (value.note === undefined || isStringWithin(value.note, MAX_NOTE_LENGTH))
  )
}

function isExerciseGroup(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.activeVariantId)) {
    return false
  }

  // restSeconds is optional here for backward compatibility — pre-per-exercise-rest saves lack it and
  // are migrated in on load. If present it must be a positive number.
  if (value.restSeconds !== undefined && !isPositiveInteger(value.restSeconds)) {
    return false
  }

  // Swap-pair flags: hidden dims/hides an exercise, linkId pairs two exercises. Both optional, but a
  // malformed value would silently break the swap logic, so type-check them when present.
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') {
    return false
  }
  if (value.linkId !== undefined && !isNonEmptyString(value.linkId)) {
    return false
  }

  if (!Array.isArray(value.variants) || value.variants.length === 0 || !value.variants.every(isVariant)) {
    return false
  }

  return value.variants.some(
    (variant) => isRecord(variant) && variant.id === value.activeVariantId,
  )
}

function isWorkoutTemplate(value: unknown) {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isStringWithin(value.name, MAX_WORKOUT_NAME_LENGTH, false)
  ) {
    return false
  }

  if (!Array.isArray(value.groups) || value.groups.length === 0 || !value.groups.every(isExerciseGroup)) {
    return false
  }

  const groupIds = value.groups.map((group) => group.id as string)
  if (new Set(groupIds).size !== groupIds.length) {
    return false
  }

  const linkMembers = new Map<string, Array<{ hidden?: boolean }>>()
  for (const group of value.groups) {
    if (group.linkId) {
      const members = linkMembers.get(group.linkId as string) ?? []
      members.push(group)
      linkMembers.set(group.linkId as string, members)
    }
  }
  return [...linkMembers.values()].every(
    (members) => members.length === 2 && members.filter((member) => Boolean(member.hidden)).length === 1,
  )
}

function isVariantOverride(value: unknown) {
  if (!isRecord(value) || !Object.keys(value).every((key) => VARIANT_OVERRIDE_KEYS.has(key))) {
    return false
  }

  return (
    (value.name === undefined || isStringWithin(value.name, MAX_EXERCISE_NAME_LENGTH, false)) &&
    (value.category === undefined || (typeof value.category === 'string' && CATEGORIES.has(value.category))) &&
    (value.setup === undefined || isStringWithin(value.setup, MAX_SETUP_LENGTH)) &&
    (value.sets === undefined || isValidCount(value.sets)) &&
    (value.reps === undefined || isValidCount(value.reps)) &&
    (value.weight === undefined || isFiniteNonNegative(value.weight)) &&
    (value.perHand === undefined || typeof value.perHand === 'boolean') &&
    (value.lastResult === undefined ||
      (typeof value.lastResult === 'string' && PREVIOUS_RESULTS.has(value.lastResult))) &&
    (value.note === undefined || isStringWithin(value.note, MAX_NOTE_LENGTH))
  )
}

export function isValidTemplates(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PROGRAMS * MAX_PROGRAM_DAYS || !value.every(isWorkoutTemplate)) {
    return false
  }

  const ids = value.map((template) => (template as { id: string }).id)
  if (new Set(ids).size !== ids.length) {
    return false
  }

  // Group and exercise ids are app-wide keys (variant preferences and editor updates are keyed by
  // them), so duplicates across Workout A/B would make an edit affect the wrong exercise.
  const groupIds: string[] = []
  const variantIds: string[] = []
  for (const template of value) {
    for (const group of (template as { groups: Array<{ id: string; variants: Array<{ id: string }> }> }).groups) {
      groupIds.push(group.id)
      variantIds.push(...group.variants.map((variant) => variant.id))
    }
  }
  return new Set(groupIds).size === groupIds.length && new Set(variantIds).size === variantIds.length
}

function isWorkoutProgram(value: unknown, templateIds: ReadonlySet<string>) {
  if (!isRecord(value)) return false
  if (
    !isNonEmptyString(value.id) ||
    !isStringWithin(value.name, MAX_WORKOUT_NAME_LENGTH, false) ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt <= 0 ||
    !Array.isArray(value.workoutIds) ||
    value.workoutIds.length === 0 ||
    value.workoutIds.length > MAX_PROGRAM_DAYS ||
    !value.workoutIds.every((id) => typeof id === 'string' && templateIds.has(id))
  ) {
    return false
  }
  return new Set(value.workoutIds).size === value.workoutIds.length
}

export function isValidPrograms(value: unknown, templates: unknown) {
  if (!isValidTemplates(templates) || !Array.isArray(value) || value.length === 0 || value.length > MAX_PROGRAMS) {
    return false
  }
  const templateIds = new Set((templates as Array<{ id: string }>).map((template) => template.id))
  if (!value.every((program) => isWorkoutProgram(program, templateIds))) return false
  const programIds = value.map((program) => (program as { id: string }).id)
  const assignedWorkoutIds = value.flatMap((program) => (program as { workoutIds: string[] }).workoutIds)
  return (
    new Set(programIds).size === programIds.length &&
    new Set(assignedWorkoutIds).size === assignedWorkoutIds.length &&
    assignedWorkoutIds.length === templateIds.size &&
    assignedWorkoutIds.every((id) => templateIds.has(id))
  )
}

// Local saves created before the linked-delete fix can contain a one-sided pair that the editor can
// no longer unlink. Repair only that known shape before strict validation; imported backups still
// have to pass isValidTemplates unchanged.
export function repairTemplateLinks(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value
  }
  const repaired = structuredClone(value)
  for (const template of repaired) {
    if (!isRecord(template) || !Array.isArray(template.groups)) {
      continue
    }
    const links = new Map<string, Record<string, unknown>[]>()
    for (const group of template.groups) {
      if (!isRecord(group) || typeof group.linkId !== 'string') {
        continue
      }
      const members = links.get(group.linkId) ?? []
      members.push(group)
      links.set(group.linkId, members)
    }
    for (const members of links.values()) {
      if (members.length !== 2) {
        for (const member of members) {
          delete member.linkId
          member.hidden = false
        }
      } else if (members.filter((member) => Boolean(member.hidden)).length !== 1) {
        members[0].hidden = false
        members[1].hidden = true
      }
    }
  }
  return repaired
}

function isSessionExercise(value: unknown) {
  if (!isRecord(value) || !isFiniteNonNegative(value.weight)) {
    return false
  }

  return (
    isOptionalStringWithin(value.setup, MAX_SETUP_LENGTH) &&
    isOptionalValidCount(value.sets) &&
    isOptionalValidCount(value.reps) &&
    (value.perHand === undefined || typeof value.perHand === 'boolean') &&
    (value.result === undefined || value.result === 'success' || value.result === 'failure') &&
    (value.increaseResolved === undefined || typeof value.increaseResolved === 'boolean') &&
    (value.increaseDelta === undefined || isFiniteNonNegative(value.increaseDelta))
  )
}

function isSessionGroup(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.activeVariantId) || !isRecord(value.entries)) {
    return false
  }

  return String(value.activeVariantId) in value.entries && Object.values(value.entries).every(isSessionExercise)
}

function isWorkoutSession(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.workoutId)) {
    return false
  }

  return (
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    value.createdAt > 0 &&
    (value.finishedAt === undefined ||
      (typeof value.finishedAt === 'number' &&
        Number.isFinite(value.finishedAt) &&
        value.finishedAt > value.createdAt)) &&
    (value.endedEarly === undefined ||
      (value.endedEarly === true &&
        typeof value.finishedAt === 'number' &&
        Number.isFinite(value.finishedAt) &&
        value.finishedAt > value.createdAt)) &&
    (value.programId === undefined || isNonEmptyString(value.programId)) &&
    (value.programName === undefined || isStringWithin(value.programName, MAX_WORKOUT_NAME_LENGTH, false)) &&
    (value.workoutName === undefined || isStringWithin(value.workoutName, MAX_WORKOUT_NAME_LENGTH, false)) &&
    (value.workoutSnapshot === undefined ||
      (isRecord(value.workoutSnapshot) &&
        isWorkoutTemplate(value.workoutSnapshot) &&
        value.workoutSnapshot.id === value.workoutId)) &&
    isRecord(value.groupEntries) &&
    Object.values(value.groupEntries).every(isSessionGroup)
  )
}

export function isValidSessions(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || !value.every(isWorkoutSession)) {
    return false
  }
  const ids = value.map((session) => (session as { id: string }).id)
  return new Set(ids).size === ids.length
}

// Local storage can be interrupted mid-write or partially damaged. Imports stay strict, but local
// startup keeps every structurally sound, resolvable workout instead of dropping the entire history
// because one record is bad.
export function recoverValidSessions(
  value: unknown,
  resolvableWorkoutIds?: ReadonlySet<string>,
): unknown[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((session) => {
    if (!isWorkoutSession(session)) return false
    const candidate = session as { id: string; workoutId: string; workoutSnapshot?: unknown }
    if (
      candidate.workoutSnapshot === undefined &&
      resolvableWorkoutIds &&
      !resolvableWorkoutIds.has(candidate.workoutId)
    ) return false
    const id = candidate.id
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function isRecordOf(value: unknown, predicate: (entry: unknown) => boolean) {
  return isRecord(value) && Object.values(value).every(predicate)
}

export function isValidBackup(value: unknown) {
  if (!isRecord(value) || !isValidSessions(value.sessions)) {
    return false
  }

  const templatesValid = value.templates === undefined || isValidTemplates(value.templates)
  const programsValid =
    value.programs === undefined ||
    (isValidPrograms(value.programs, value.templates) &&
      typeof value.activeProgramId === 'string' &&
      (value.programs as Array<{ id: string }>).some((program) => program.id === value.activeProgramId))
  const templateIds = isValidTemplates(value.templates)
    ? new Set((value.templates as Array<{ id: string }>).map((template) => template.id))
    : new Set<string>()
  const sessionsResolvable = (value.sessions as Array<{ workoutId: string; workoutSnapshot?: unknown }>).every(
    (session) => session.workoutSnapshot !== undefined || templateIds.has(session.workoutId),
  )

  return (
    templatesValid &&
    programsValid &&
    (value.activeProgramId === undefined || typeof value.activeProgramId === 'string') &&
    sessionsResolvable &&
    (value.variantOverrides === undefined || isRecordOf(value.variantOverrides, isVariantOverride)) &&
    (value.variantPrefs === undefined || isRecordOf(value.variantPrefs, isNonEmptyString)) &&
    (value.baselineResults === undefined ||
      isRecordOf(value.baselineResults, (result) => typeof result === 'string' && PREVIOUS_RESULTS.has(result))) &&
    (value.expandedBySession === undefined || isRecordOf(value.expandedBySession, (entry) => typeof entry === 'string')) &&
    (value.scrollBySession === undefined ||
      isRecordOf(value.scrollBySession, (entry) => typeof entry === 'number' && Number.isFinite(entry))) &&
    (value.currentSessionByWorkout === undefined ||
      isRecordOf(value.currentSessionByWorkout, (entry) => typeof entry === 'string')) &&
    (value.restSeconds === undefined ||
      (typeof value.restSeconds === 'number' && Number.isFinite(value.restSeconds) && value.restSeconds > 0))
  )
}
