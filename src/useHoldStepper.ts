import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { haptics } from './haptics'

type HoldAction = () => boolean

// Shared numeric-stepper behavior: quick tap applies on release; holding for 380ms repeats every
// 110ms. Scrolling cancels the pending tap and bounds stay silent.
export function useHoldStepper() {
  const holdRef = useRef<{ timeout?: number; interval?: number; action?: HoldAction; started?: boolean }>({})

  const stop = () => {
    if (holdRef.current.timeout !== undefined) window.clearTimeout(holdRef.current.timeout)
    if (holdRef.current.interval !== undefined) window.clearInterval(holdRef.current.interval)
    holdRef.current = {}
  }

  const start = (action: HoldAction) => {
    stop()
    holdRef.current.action = action
    holdRef.current.timeout = window.setTimeout(() => {
      holdRef.current.started = true
      if (action()) void haptics.selection()
      holdRef.current.interval = window.setInterval(() => {
        if (action()) void haptics.selection()
      }, 110)
    }, 380)
  }

  const finish = () => {
    const { action, started } = holdRef.current
    if (action && !started && action()) void haptics.selection()
    stop()
  }

  const bind = (action: HoldAction) => ({
    onPointerDown: () => start(action),
    onPointerUp: finish,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (action()) void haptics.selection()
      }
    },
  })

  useEffect(() => stop, [])

  return { bind, stop }
}
