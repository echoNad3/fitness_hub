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
