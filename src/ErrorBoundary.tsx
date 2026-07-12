import { Component, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

type Props = { children: ReactNode }
type State = { failed: boolean }

// Catches render/lifecycle errors so an unexpected throw shows a recovery screen instead of a
// blank page. Reloading does not clear whatever data was successfully saved in localStorage.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch() {
    // The native splash is held until App mounts; if App crashed instead, drop the splash so the
    // reload screen below is visible.
    if (Capacitor.isNativePlatform()) {
      void SplashScreen.hide().catch(() => undefined)
    }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100svh',
          display: 'grid',
          placeContent: 'center',
          gap: 'var(--space-4, 16px)',
          padding: 'var(--space-5, 24px)',
          textAlign: 'center',
          color: 'var(--text, #f4f5f8)',
          background: 'var(--bg, #252730)',
        }}
      >
        <strong style={{ fontSize: 'var(--fs-heading, 19px)', fontWeight: 'var(--fw-bold, 800)' }}>App error</strong>
        <span style={{ color: 'var(--muted, #aab2c0)', fontSize: 'var(--fs-label, 15px)' }}>
          Reload to continue. Saved data will stay on this device.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            justifySelf: 'center',
            minHeight: 'var(--tap, 48px)',
            padding: '0 var(--space-5, 24px)',
            color: '#fff',
            background: 'var(--accent, #6074f3)',
            border: 0,
            borderRadius: 'var(--radius-control, 11px)',
            fontSize: 'var(--fs-body, 17px)',
            fontWeight: 'var(--fw-bold, 800)',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
