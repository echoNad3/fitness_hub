const WORKOUT_IDS = new Set(['workout-a', 'workout-b'])
const CATEGORIES = new Set(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'CORE', 'LEGS'])
const PREVIOUS_RESULTS = new Set(['success', 'failure', 'missing'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isOptionalPositiveInteger(value: unknown) {
  return value === undefined || isPositiveInteger(value)
}

function isVariant(value: unknown) {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.category === 'string' &&
    CATEGORIES.has(value.category) &&
    typeof value.setup === 'string' &&
    isPositiveInteger(value.sets) &&
    isPositiveInteger(value.reps) &&
    isFiniteNonNegative(value.weight) &&
    typeof value.perHand === 'boolean' &&
    typeof value.lastResult === 'string' &&
    PREVIOUS_RESULTS.has(value.lastResult)
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

  if (!Array.isArray(value.variants) || value.variants.length === 0 || !value.variants.every(isVariant)) {
    return false
  }

  return value.variants.some(
    (variant) => isRecord(variant) && variant.id === value.activeVariantId,
  )
}

function isWorkoutTemplate(value: unknown) {
  if (!isRecord(value) || typeof value.id !== 'string' || !WORKOUT_IDS.has(value.id) || !isNonEmptyString(value.name)) {
    return false
  }

  return Array.isArray(value.groups) && value.groups.length > 0 && value.groups.every(isExerciseGroup)
}

function isVariantOverride(value: unknown) {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.name === undefined || isNonEmptyString(value.name)) &&
    (value.category === undefined || (typeof value.category === 'string' && CATEGORIES.has(value.category))) &&
    (value.setup === undefined || typeof value.setup === 'string') &&
    (value.sets === undefined || isPositiveInteger(value.sets)) &&
    (value.reps === undefined || isPositiveInteger(value.reps)) &&
    (value.weight === undefined || isFiniteNonNegative(value.weight)) &&
    (value.perHand === undefined || typeof value.perHand === 'boolean') &&
    (value.lastResult === undefined ||
      (typeof value.lastResult === 'string' && PREVIOUS_RESULTS.has(value.lastResult)))
  )
}

export function isValidTemplates(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length !== WORKOUT_IDS.size || !value.every(isWorkoutTemplate)) {
    return false
  }

  const ids = new Set(value.map((template) => (isRecord(template) ? template.id : undefined)))
  return [...WORKOUT_IDS].every((id) => ids.has(id))
}

function isSessionExercise(value: unknown) {
  if (!isRecord(value) || !isFiniteNonNegative(value.weight)) {
    return false
  }

  return (
    isOptionalString(value.setup) &&
    isOptionalPositiveInteger(value.sets) &&
    isOptionalPositiveInteger(value.reps) &&
    (value.result === undefined || value.result === 'success' || value.result === 'failure')
  )
}

function isSessionGroup(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.activeVariantId) || !isRecord(value.entries)) {
    return false
  }

  return Object.values(value.entries).every(isSessionExercise)
}

function isWorkoutSession(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || typeof value.workoutId !== 'string') {
    return false
  }

  return (
    WORKOUT_IDS.has(value.workoutId) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    isRecord(value.groupEntries) &&
    Object.values(value.groupEntries).every(isSessionGroup)
  )
}

export function isValidSessions(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.every(isWorkoutSession)
}

function isRecordOf(value: unknown, predicate: (entry: unknown) => boolean) {
  return isRecord(value) && Object.values(value).every(predicate)
}

export function isValidBackup(value: unknown) {
  if (!isRecord(value) || !isValidSessions(value.sessions)) {
    return false
  }

  return (
    (value.templates === undefined || isValidTemplates(value.templates)) &&
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
