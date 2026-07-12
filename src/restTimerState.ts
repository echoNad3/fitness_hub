export type StoredRestTimer = {
  endsAt: number
  duration: number
}

const MAX_STORED_REST_DURATION_SECONDS = 24 * 60 * 60

export function parseStoredRestTimer(value: string | null, now: number): StoredRestTimer | null {
  if (!value) {
    return null
  }
  try {
    const candidate = JSON.parse(value) as Partial<StoredRestTimer>
    return typeof candidate.endsAt === 'number' &&
      Number.isFinite(candidate.endsAt) &&
      candidate.endsAt > now &&
      typeof candidate.duration === 'number' &&
      Number.isFinite(candidate.duration) &&
      candidate.duration > 0 &&
      candidate.duration <= MAX_STORED_REST_DURATION_SECONDS
      ? { endsAt: candidate.endsAt, duration: candidate.duration }
      : null
  } catch {
    return null
  }
}
