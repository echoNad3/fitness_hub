import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

// Catches render/lifecycle errors so an unexpected throw shows a recover screen instead of a blank
// white page. The user's data lives in localStorage, so reloading recovers without data loss.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
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
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text, #f4f5f8)',
          background: 'var(--bg, #252730)',
        }}
      >
        <strong style={{ fontSize: '1.1875rem', fontWeight: 800 }}>Something went wrong</strong>
        <span style={{ color: 'var(--muted, #aab2c0)', fontSize: '0.9375rem' }}>
          Your saved workouts are safe. Reload to continue.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            justifySelf: 'center',
            minHeight: '48px',
            padding: '0 24px',
            color: '#fff',
            background: 'var(--accent, #6074f3)',
            border: 0,
            borderRadius: '11px',
            fontSize: '1.0625rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
