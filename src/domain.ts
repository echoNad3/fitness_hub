export type WorkoutResult = 'success' | 'failure'

export function toggleResult(current: WorkoutResult | undefined, requested: WorkoutResult) {
  return current === requested ? undefined : requested
}

export function moveItem<T extends { id: string }>(items: T[], itemId: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === itemId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= items.length) {
    return items
  }

  const movedItems = [...items]
  const [moved] = movedItems.splice(index, 1)
  movedItems.splice(target, 0, moved)
  return movedItems
}

export function nextPendingId(
  itemIds: string[],
  currentItemId: string,
  isComplete: (itemId: string) => boolean,
) {
  const currentIndex = itemIds.indexOf(currentItemId)
  return itemIds.slice(currentIndex + 1).find((itemId) => !isComplete(itemId))
}

export function clampRestSeconds(current: number, delta: number) {
  return Math.min(600, Math.max(15, current + delta))
}

export function selectActiveVariantId(
  sessionVariantId: string | undefined,
  preferredVariantId: string | undefined,
  defaultVariantId: string,
) {
  return sessionVariantId ?? preferredVariantId ?? defaultVariantId
}
