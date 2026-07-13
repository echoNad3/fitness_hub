export const HISTORY_PAGE_SIZE = 50

export function clampHistoryCount(visibleCount: number, totalCount: number) {
  const safeVisible = Number.isFinite(visibleCount) ? Math.max(HISTORY_PAGE_SIZE, Math.floor(visibleCount)) : HISTORY_PAGE_SIZE
  return Math.min(Math.max(0, totalCount), safeVisible)
}

export function nextHistoryCount(visibleCount: number, totalCount: number) {
  return Math.min(Math.max(0, totalCount), clampHistoryCount(visibleCount, totalCount) + HISTORY_PAGE_SIZE)
}

export function historyCountForIndex(index: number, totalCount: number) {
  if (index < 0) {
    return clampHistoryCount(HISTORY_PAGE_SIZE, totalCount)
  }
  const required = Math.ceil((index + 1) / HISTORY_PAGE_SIZE) * HISTORY_PAGE_SIZE
  return clampHistoryCount(required, totalCount)
}
