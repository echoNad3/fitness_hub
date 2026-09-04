export type CloudInsertResult = 'inserted' | 'conflict'

export type ConditionalCloudWriter = {
  updateIfOlder: () => Promise<boolean>
  insert: () => Promise<CloudInsertResult>
  readUpdatedAt: () => Promise<number | null>
}

export class CloudWriteConflictError extends Error {
  constructor() {
    super('Newer account changes were saved by another device. Retry sync.')
    this.name = 'CloudWriteConflictError'
  }
}

// Updates are guarded by the timestamp in the database itself. This prevents a slow request from
// an older device from landing after a newer request and replacing the newer workout data.
export async function saveNewestCloudState(
  writer: ConditionalCloudWriter,
  updatedAt: number,
) {
  if (await writer.updateIfOlder()) return

  const insertResult = await writer.insert()
  if (insertResult === 'inserted') return

  // Another device may have inserted the first row between our update and insert. Retry the same
  // atomic timestamp guard once so the newer of those two writes still wins.
  if (await writer.updateIfOlder()) return

  const remoteUpdatedAt = await writer.readUpdatedAt()
  if (remoteUpdatedAt !== null && remoteUpdatedAt >= updatedAt) {
    throw new CloudWriteConflictError()
  }

  throw new Error('Account data could not be saved safely. Retry sync.')
}
