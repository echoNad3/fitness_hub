const WORKOUT_IDS = new Set(['workout-a', 'workout-b'])
const CATEGORIES = new Set(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'CORE', 'LEGS'])
const PREVIOUS_RESULTS = new Set(['success', 'failure', 'missing'])
const MAX_EXERCISE_NAME_LENGTH = 80
const MAX_SETUP_LENGTH = 120
const MAX_NOTE_LENGTH = 240
const MAX_COUNT = 999

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
  if (!isRecord(value) || typeof value.id !== 'string' || !WORKOUT_IDS.has(value.id) || !isNonEmptyString(value.name)) {
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
  if (![...WORKOUT_IDS].every((id) => ids.has(id))) {
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
    isOptionalString(value.setup) &&
    isOptionalPositiveInteger(value.sets) &&
    isOptionalPositiveInteger(value.reps) &&
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
  if (!isRecord(value) || !isNonEmptyString(value.id) || typeof value.workoutId !== 'string') {
    return false
  }

  return (
    WORKOUT_IDS.has(value.workoutId) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    value.createdAt > 0 &&
    (value.finishedAt === undefined ||
      (typeof value.finishedAt === 'number' &&
        Number.isFinite(value.finishedAt) &&
        value.finishedAt > value.createdAt)) &&
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
