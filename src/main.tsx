import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './index.css'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { registerAppUpdates } from './pwaUpdates.ts'
import { initializeRecoveryStore } from './recovery.ts'
import { isValidBackup } from './dataValidation.ts'
import { initializeWorkoutStorage } from './workoutStorage.ts'

await initializeRecoveryStore(isValidBackup)
await initializeWorkoutStorage()
// Auth checks storage availability when its client is created. Free the legacy recovery space first.
const { default: App } = await import('./App.tsx')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

registerAppUpdates()
