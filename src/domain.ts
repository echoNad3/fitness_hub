export type WorkoutResult = 'success' | 'failure'

export type WorkoutResultStreak = {
  result: WorkoutResult | undefined
  count: number
}

// Tapping the already-selected result clears it; tapping the other one switches.
export function toggleResult(current: WorkoutResult | undefined, requested: WorkoutResult) {
  return current === requested ? undefined : requested
}

// Count the latest run of matching results. Results are newest-first and only include past
// attempts where this exercise was actually logged. The baseline precedes all saved attempts.
export function resultStreak(
  results: WorkoutResult[],
  baseline: WorkoutResult | undefined,
): WorkoutResultStreak {
  const latest = results[0] ?? baseline
  if (!latest) {
    return { result: undefined, count: 0 }
  }

  let count = 0
  for (const result of results) {
    if (result !== latest) {
      break
    }
    count += 1
  }

  if (count === results.length && baseline === latest) {
    count += 1
  }

  return { result: latest, count }
}

export function resultGuidance(streak: WorkoutResultStreak) {
  if (!streak.result) {
    return "No previous result. Choose today's weight."
  }

  const multiplier = streak.count >= 2 ? ` x${streak.count}` : ''
  const resultWord = streak.count >= 2 ? 'results' : 'result'

  return streak.result === 'success'
    ? `Last ${resultWord}: done${multiplier}. Increase today.`
    : `Last ${resultWord}: failed${multiplier}. Repeat today.`
}

// The next unfinished item after the current one, in display order (used by auto-advance).
export function nextPendingId(
  itemIds: string[],
  currentItemId: string,
  isComplete: (itemId: string) => boolean,
) {
  const currentIndex = itemIds.indexOf(currentItemId)
  return itemIds.slice(currentIndex + 1).find((itemId) => !isComplete(itemId))
}

export const MIN_REST_SECONDS = 10
export const MAX_REST_SECONDS = 600
export const REST_STEP_SECONDS = 10
export const MIN_WORKOUT_DURATION_SECONDS = 10 * 60
export const MAX_WORKOUT_DURATION_SECONDS = 24 * 60 * 60 - 1
export const WORKOUT_DURATION_STEP_SECONDS = 10 * 60

export function workoutDurationSeconds(hours: number, minutes: number) {
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  const total = hours * 60 * 60 + minutes * 60
  return total >= MIN_WORKOUT_DURATION_SECONDS && total <= MAX_WORKOUT_DURATION_SECONDS ? total : null
}

// Clamp a rest length to the supported range.
export function clampRestValue(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_REST_SECONDS
  }
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, Math.round(value)))
}

// Remaining whole seconds until the wall-clock end time (never negative).
export function restSecondsRemaining(endsAt: number, now: number) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}
