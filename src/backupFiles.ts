import { Capacitor, registerPlugin } from '@capacitor/core'

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

type BackupFileResult = {
  cancelled?: boolean
  contents?: string
  name?: string
  saved?: boolean
  bytes?: number
  delivery?: 'download' | 'share'
}

export class BackupExportError extends Error {}

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
  const bytes = backupByteLength(contents)
  if (bytes === 0 || bytes > MAX_BACKUP_BYTES) throw new BackupExportError('Backup is empty or too large to save.')
  if (hasNativeBackupFiles()) {
    try {
      const result = await BackupFiles.save({ contents, filename })
      if (!result.cancelled && (!result.saved || (result.bytes !== undefined && result.bytes !== bytes))) {
        throw new Error('Backup verification failed')
      }
      return result
    } catch {
      throw new BackupExportError('Backup could not be verified. Try saving to Downloads.')
    }
  }

  // A live web update can briefly run inside an older APK without the native file bridge. Android
  // WebViews often ignore blob downloads, so use the system share sheet when it is available.
  if (Capacitor.isNativePlatform() && typeof File !== 'undefined' && navigator.share && navigator.canShare) {
    const file = new File([contents], filename, { type: 'application/json' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Fitness Hub backup' })
        return { saved: true, delivery: 'share' }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return { cancelled: true }
        // Native WebViews must not fall back to unreliable blob downloads.
      }
    }
  }

  if (Capacitor.isNativePlatform()) {
    throw new BackupExportError('Update the Android app to export backups.')
  }

  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    return { saved: true, delivery: 'download' }
  } finally {
    // Keep the link and blob alive while mobile browsers confirm and consume the download.
    window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url) }, 60_000)
  }
}

export async function openNativeBackupFile(): Promise<BackupFileResult> {
  if (!hasNativeBackupFiles()) {
    throw new Error('Native backup files are unavailable.')
  }
  return BackupFiles.open()
}
