import { canonicalRecoveryJson, isProtectedRecoveryCopy, type RecoverySnapshot } from './recovery.ts'

export type RecoveryIndex = Pick<RecoverySnapshot, 'id' | 'createdAt' | 'reason' | 'hash' | 'retention'>

export function missingRecoveryIds(local: RecoverySnapshot[], remote: RecoveryIndex[], deletedIds: string[]) {
  const known = new Map(local.map(copy => [copy.id, copy.hash]))
  const deleted = new Set(deletedIds)
  return remote.filter(copy => !deleted.has(copy.id) && known.get(copy.id) !== copy.hash).map(copy => copy.id)
}

export function pendingRecoveryUploads(copies: RecoverySnapshot[], remote: RecoveryIndex[]) {
  const known = new Map(remote.map(copy => [copy.id, copy]))
  return copies.filter(copy => {
    const existing = known.get(copy.id)
    return !existing || existing.hash !== copy.hash ||
      (isProtectedRecoveryCopy(copy) && !isProtectedRecoveryCopy(existing))
  })
}

// A committed local or verified cloud copy is sufficient; failure in both locations blocks replacement.
export async function preserveBeforeCloudReplacement(options: {
  data: unknown
  saveLocal: () => Promise<boolean>
  saveCloud: () => Promise<RecoverySnapshot>
  readCloud: (id: string) => Promise<unknown[]>
  isValidSnapshot: (value: unknown) => value is RecoverySnapshot
}) {
  if (await options.saveLocal()) return
  const saved = await options.saveCloud()
  const verified = (await options.readCloud(saved.id)).find(options.isValidSnapshot)
  if (!verified || verified.id !== saved.id || canonicalRecoveryJson(verified.data) !== canonicalRecoveryJson(options.data)) {
    throw new Error('Recovery copy could not be verified. Nothing was replaced.')
  }
}
