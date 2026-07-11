export type WorkoutResult = 'success' | 'failure'

// Tapping the already-selected result clears it; tapping the other one switches.
export function toggleResult(current: WorkoutResult | undefined, requested: WorkoutResult) {
  return current === requested ? undefined : requested
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

export const MIN_REST_SECONDS = 5
export const MAX_REST_SECONDS = 600
export const MAX_WORKOUT_DURATION_MINUTES = 23 * 60 + 59

export function workoutDurationMinutes(hours: number, minutes: number) {
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  const total = hours * 60 + minutes
  return total >= 1 && total <= MAX_WORKOUT_DURATION_MINUTES ? total : null
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
