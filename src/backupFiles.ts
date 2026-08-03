import { Capacitor, registerPlugin } from '@capacitor/core'

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

type BackupFileResult = {
  cancelled?: boolean
  contents?: string
  name?: string
  saved?: boolean
}

interface BackupFilesPlugin {
  open(): Promise<BackupFileResult>
  save(options: { contents: string; filename: string }): Promise<BackupFileResult>
}

const BackupFiles = registerPlugin<BackupFilesPlugin>('BackupFiles')

export function backupFilename(now = new Date()): string {
  return `fitness-hub-backup-${now.toISOString().slice(0, 10)}.json`
}

export function backupByteLength(contents: string): number {
  return new TextEncoder().encode(contents).byteLength
}

export function normalizeBackupContents(contents: string): string {
  return contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents
}

export function hasNativeBackupFiles(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackupFiles')
}

export async function saveBackupFile(contents: string, filename: string): Promise<BackupFileResult> {
  if (hasNativeBackupFiles()) {
    return BackupFiles.save({ contents, filename })
  }

  // A live web update can briefly run inside an older APK without the native file bridge. Android
  // WebViews often ignore blob downloads, so use the system share sheet when it is available.
  if (Capacitor.isNativePlatform() && typeof File !== 'undefined' && navigator.share && navigator.canShare) {
    const file = new File([contents], filename, { type: 'application/json' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Fitness Hub backup' })
        return { saved: true }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return { cancelled: true }
        // Fall through if this WebView exposes Share but cannot open it.
      }
    }
  }

  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    return { saved: true }
  } finally {
    // Revoking in the same tick can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
}

export async function openNativeBackupFile(): Promise<BackupFileResult> {
  if (!hasNativeBackupFiles()) {
    throw new Error('Native backup files are unavailable.')
  }
  return BackupFiles.open()
}
