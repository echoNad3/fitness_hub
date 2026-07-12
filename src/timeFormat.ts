// Visible time values use at most two adjacent units. Workout/history durations deliberately use
// minute precision; active timers use a minutes:seconds clock.
export function formatWorkoutDuration(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  if (days > 0) {
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
    return `${days}d ${hours}h`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`
}

export function formatTimerDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}
