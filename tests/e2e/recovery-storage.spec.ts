import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const userId = '11111111-1111-4111-8111-111111111111'

for (const { failWrites, headroom, cloudFallback } of [
  { failWrites: false, headroom: 256, cloudFallback: false },
  { failWrites: false, headroom: 0, cloudFallback: false },
  { failWrites: true, headroom: 256, cloudFallback: false },
  { failWrites: true, headroom: 256, cloudFallback: true },
]) {
  test(`full local storage ${cloudFallback ? 'syncs with a verified cloud backup when local recovery fails' : failWrites ? 'keeps account unchanged if recovery fails' : 'migrates recovery copies and syncs workouts'} (${headroom} bytes free)`, async ({ page }) => {
    await page.route('**/android-release.json*', route => route.fulfill({
      json: { build: 77, publishedAt: 1_700_000_000_000 },
    }))
    await page.route('https://jrsowjbxenkrmzzknnab.supabase.co/**', route => route.fulfill({ json: [] }))
    await page.goto('/')
    await expect.poll(() => page.evaluate(async () => (await import('/src/workoutStorage.ts')).getWorkoutDataRaw())).not.toBeNull()
    const fixture = await page.evaluate(async ({ id, headroom }) => {
      // Exercise the actual snapshot format and hash with valid app data.
      const { createRecoverySnapshot } = await import('/src/recovery.ts')
      const data = JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!)
      const remoteData = structuredClone(data)
      data.restSeconds = 123
      const workout = data.templates[0]
      data.sessions.push({
        id: 'unsynced-workout', workoutId: workout.id,
        programId: data.activeProgramId, programName: data.programs[0].name,
        workoutName: workout.name, workoutSnapshot: structuredClone(workout),
        createdAt: Date.now() - 3_600_000, finishedAt: Date.now() - 1_800_000,
        endedEarly: true, groupEntries: {},
      })
      const copy = createRecoverySnapshot({ ...remoteData, restSeconds: 75 }, 'manual', { id: 'protected-copy', now: Date.now() - 10_000 })
      const legacy = JSON.stringify({ copies: [copy], deletedIds: ['already-deleted'] })
      localStorage.setItem('fitness-hub-recovery-v1', legacy)
      localStorage.setItem('fitness-hub-v1', JSON.stringify(data))
      localStorage.setItem('fitness-hub-v1-updated-at', String(Date.now()))
      localStorage.setItem('fitness-hub-v1-synced-account', id)
      localStorage.setItem('sb-jrsowjbxenkrmzzknnab-auth-token', JSON.stringify({
        access_token: 'test-access-token', refresh_token: 'test-refresh-token',
        token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' },
      }))
      // Fill real Chrome localStorage, then verify that adding a recovery copy fails.
      for (let size = 1_048_576; size >= 1; size = Math.floor(size / 2)) {
        while (true) {
          const current = localStorage.getItem('quota-filler') ?? ''
          try { localStorage.setItem('quota-filler', current + 'x'.repeat(size)) } catch { break }
        }
      }
      // Leave room for auth's tiny storage-availability probe, but not another snapshot.
      if (headroom > 0) localStorage.setItem('quota-filler', localStorage.getItem('quota-filler')!.slice(0, -headroom))
      let blocked = false
      try { localStorage.setItem('fitness-hub-recovery-v1', legacy + ' '.repeat(1000)) } catch { blocked = true }
      return { data, remoteData, legacy, blocked }
    }, { id: userId, headroom })
    expect(fixture.blocked).toBe(true)

    if (failWrites) {
      await page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
          const request = put.apply(this, args)
          // A successful request is not a committed backup: the transaction can still fail.
          request.addEventListener('success', () => this.transaction.abort())
          return request
        }
      })
    }
    let uploaded: unknown
    const savedCopies: unknown[] = []
    const cloudCopies = new Map<string, Record<string, unknown>>()
    await page.unroute('https://jrsowjbxenkrmzzknnab.supabase.co/**')
    await page.route('https://jrsowjbxenkrmzzknnab.supabase.co/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname.endsWith('/app_state')) {
        if (request.method() === 'PATCH') {
          if (cloudFallback) expect([...cloudCopies.values()].some(row => row.reason === 'before-cloud-replace')).toBe(true)
          uploaded = request.postDataJSON().data
          await route.fulfill({ json: { updated_at: request.postDataJSON().updated_at } })
        } else {
          await route.fulfill({ json: { data: fixture.remoteData, updated_at: new Date(Date.now() - 60_000).toISOString() } })
        }
      } else if (url.pathname.endsWith('/app_recovery_snapshots') && request.method() === 'POST') {
        savedCopies.push(...request.postDataJSON())
        if (cloudFallback) for (const row of request.postDataJSON()) cloudCopies.set(row.id, row)
        await route.fulfill({ json: [] })
      } else if (url.pathname.endsWith('/app_recovery_snapshots') && request.method() === 'GET') {
        const idFilter = url.searchParams.get('id')
        await route.fulfill({ json: [...cloudCopies.values()].filter(row => !idFilter || idFilter.includes(String(row.id))) })
      } else {
        await route.fulfill({ json: [] })
      }
    })
    await page.reload()
    await page.getByRole('button', { name: /^Account/ }).click()
    const account = page.getByRole('dialog', { name: 'Account' })
    if (failWrites && !cloudFallback) {
      await expect(account).toContainText('Recovery copy could not be saved. Account data was not changed.')
      expect(uploaded).toBeUndefined()
      expect(await page.evaluate(async () => localStorage.getItem('fitness-hub-recovery-v1'))).toBe(fixture.legacy)
    } else {
      await expect(account).toContainText('Synced')
      await expect.poll(() => uploaded).toEqual(fixture.data)
      await expect.poll(() => savedCopies.some((value) => (value as { id: string }).id === 'protected-copy')).toBe(true)
      if (cloudFallback) {
        await expect(account.getByRole('button', { name: 'Manage recovery copies' })).toBeVisible()
        expect(await page.evaluate(async () => localStorage.getItem('fitness-hub-recovery-v1'))).toBe(fixture.legacy)
        return
      }
      expect(await page.evaluate(async () => localStorage.getItem('fitness-hub-recovery-v1'))).toBeNull()
      // An older open tab can still write the legacy key after the first migration.
      await page.evaluate(async () => {
        const { createRecoverySnapshot } = await import('/src/recovery.ts')
        const data = JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!)
        const copy = createRecoverySnapshot({ ...data, restSeconds: 95 }, 'manual', { id: 'late-legacy-copy', now: Date.now() })
        // Clear only the artificial quota filler to seed that older-tab write.
        localStorage.removeItem('quota-filler')
        localStorage.setItem('fitness-hub-recovery-v1', JSON.stringify({ copies: [copy], deletedIds: [] }))
      })
      await page.reload()
      await page.getByRole('button', { name: /Settings Backups/ }).click()
      await page.getByRole('button', { name: /Recovery copies/ }).click()
      await expect(page.getByRole('button', { name: /Manual copy/ })).toHaveCount(2)
    }
    expect(await page.evaluate(async () => JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!).restSeconds)).toBe(123)
    expect(await page.evaluate(async () => JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!).sessions.map((session: { id: string }) => session.id))).toEqual(['unsynced-workout'])
    expect(await page.evaluate(async () => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  })
}

test('compressed copies update individually and can be kept and exported on a phone', async ({ page }, testInfo) => {
  await page.route('**/android-release.json*', route => route.fulfill({ json: { build: 77, publishedAt: 1_700_000_000_000 } }))
  await page.addInitScript(() => {
    const target = window as typeof window & { __recoveryPuts: string[] }
    target.__recoveryPuts = []
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'copies') target.__recoveryPuts.push(args[0].id)
      return put.apply(this, args)
    }
  })
  await page.goto('/')
  await expect.poll(() => page.evaluate(async () => (await import('/src/workoutStorage.ts')).getWorkoutDataRaw())).not.toBeNull()
  await page.evaluate(async () => {
    const { createRecoverySnapshot } = await import('/src/recovery.ts')
    const data = JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!)
    const copies = [1, 2, 3].map(index => createRecoverySnapshot({ ...data, restSeconds: 90 + index }, 'manual', { id: `manual-${index}`, now: index }))
    copies.push(createRecoverySnapshot({ ...data, restSeconds: 120 }, 'before-workout-edit', { id: 'rotating-copy', now: 4 }))
    localStorage.setItem('fitness-hub-recovery-v1', JSON.stringify({ copies, deletedIds: [] }))
  })
  await page.reload()
  const metrics = await page.evaluate(async () => {
    const { recoveryStorageUsage } = await import('/src/recoveryStorage.ts')
    const { loadRecoveryStore } = await import('/src/recovery.ts')
    const rawBytes = new TextEncoder().encode(JSON.stringify(loadRecoveryStore(() => true))).length
    return { ...recoveryStorageUsage(), rawBytes }
  })
  expect(metrics.bytes).toBeLessThan(metrics.rawBytes / 2)
  await page.getByRole('button', { name: /Settings Backups/ }).click()
  await page.getByRole('button', { name: /Recovery copies/ }).click()
  await expect(page.getByRole('dialog', { name: 'Recovery copies' })).toContainText('up to 20 copies or 20 MB')
  await page.getByRole('button', { name: /Before workout edit/ }).click()
  await expect(page.getByText('Rotates automatically', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep this copy' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('rotating-copy.png') })
  await page.evaluate(async () => { (window as typeof window & { __recoveryPuts: string[] }).__recoveryPuts = [] })
  await page.getByRole('button', { name: 'Keep this copy' }).click()
  await expect(page.getByText('Protected until deleted', { exact: true })).toBeVisible()
  expect(await page.evaluate(async () => (window as typeof window & { __recoveryPuts: string[] }).__recoveryPuts)).toEqual(['rotating-copy'])
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export this copy' }).click()
  const download = await downloadPromise
  const contents = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(contents.restSeconds).toBe(120)
  await expect(page.getByRole('button', { name: 'Export this copy' })).toBeInViewport()
  expect(await page.evaluate(async () => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('recovery-copy.png') })
})

test('the previous IndexedDB archive migrates without deleting protected copies', async ({ page }) => {
  await page.route('**/android-release.json*', route => route.fulfill({ json: { build: 77, publishedAt: 1_700_000_000_000 } }))
  await page.route('**/storage-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage fixture</title>' }))
  await page.goto('/storage-fixture')
  await page.evaluate(async () => {
    const { createRecoverySnapshot } = await import('/src/recovery.ts')
    const copy = createRecoverySnapshot({ sessions: [] }, 'before-import', { id: 'legacy-protected', now: 1 })
    delete copy.retention
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('fitness-hub-recovery', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('recovery')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('recovery', 'readwrite')
        transaction.objectStore('recovery').put(JSON.stringify({ copies: [copy], deletedIds: ['old-deletion'] }), 'store')
        transaction.oncomplete = () => { db.close(); resolve() }
      }
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Settings Backups/ }).click()
  await page.getByRole('button', { name: /Recovery copies/ }).click()
  const legacyCopy = page.getByRole('button', { name: /Before backup import/ })
  await expect(legacyCopy).toContainText('Protected')
  await legacyCopy.click()
  await expect(page.getByText('Protected until deleted', { exact: true })).toBeVisible()
  await page.reload()
  const store = await page.evaluate(async () => {
    const { loadRecoveryStore } = await import('/src/recovery.ts')
    return loadRecoveryStore(() => true)
  })
  expect(store.copies.map(copy => copy.id)).toEqual(['legacy-protected'])
  expect(store.deletedIds).toContain('old-deletion')
})

test('cloud recovery indexes and deletions paginate beyond the default database row limit', async ({ page }) => {
  await page.route('**/android-release.json*', route => route.fulfill({ json: { build: 77, publishedAt: 1_700_000_000_000 } }))
  const indexRows = Array.from({ length: 401 }, (_, index) => ({ id: `copy-${String(index).padStart(5, '0')}`, created_at: new Date(1).toISOString(), reason: 'manual', data_hash: 'hash', retention: 'protected' }))
  const deletedRows = Array.from({ length: 1201 }, (_, index) => ({ id: `deleted-${String(index).padStart(5, '0')}` }))
  await page.route('https://jrsowjbxenkrmzzknnab.supabase.co/**', route => {
    const url = new URL(route.request().url())
    const rows = url.pathname.endsWith('/app_recovery_deletions') ? deletedRows : indexRows
    const cursor = url.searchParams.get('id')?.slice(3) ?? ''
    return route.fulfill({ json: rows.filter(row => row.id > cursor).slice(0, Number(url.searchParams.get('limit'))) })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { loadCloudRecoveryIndex, loadCloudRecoveryDeletedIds } = await import('/src/cloud.ts')
    const [copies, deletions] = await Promise.all([loadCloudRecoveryIndex('test-user'), loadCloudRecoveryDeletedIds('test-user')])
    return { copies: copies.length, deletions: deletions.length, last: deletions.at(-1) }
  })
  expect(result).toEqual({ copies: 401, deletions: 1201, last: 'deleted-01200' })
})

test('years of workout history exceed the old quota and small edits do not rewrite history', async ({ page }) => {
  await page.route('**/android-release.json*', route => route.fulfill({ json: { build: 77, publishedAt: 1_700_000_000_000 } }))
  await page.addInitScript(() => {
    const target = window as typeof window & { __sessionPuts: string[] }
    target.__sessionPuts = []
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'sessions') target.__sessionPuts.push(args[0].id)
      return put.apply(this, args)
    }
  })
  await page.goto('/')
  await expect.poll(() => page.evaluate(async () => (await import('/src/workoutStorage.ts')).getWorkoutDataRaw())).not.toBeNull()
  const expected = await page.evaluate(async () => {
    const { getWorkoutDataRaw, persistWorkoutData } = await import('/src/workoutStorage.ts')
    const data = JSON.parse(getWorkoutDataRaw()!)
    const workout = data.templates[0]
    const base = { id: 'history-0000', workoutId: workout.id,
      programId: data.activeProgramId, programName: data.programs[0].name,
      workoutName: workout.name, workoutSnapshot: workout,
      createdAt: Date.now() - 3_600_000, finishedAt: Date.now() - 1_800_000,
      endedEarly: true, groupEntries: {} }
    const count = Math.ceil(6 * 1024 * 1024 / JSON.stringify(base).length)
    data.sessions = Array.from({ length: count }, (_, index) => ({ ...base, id: `history-${String(index).padStart(4, '0')}` }))
    const saved = await persistWorkoutData(data, Date.now())
    return { count, saved, bytes: JSON.stringify(data).length }
  })
  expect(expected.saved).toBe(true)
  expect(expected.bytes).toBeGreaterThan(5 * 1024 * 1024)
  await page.reload()
  await expect(page.getByRole('button', { name: `History ${expected.count} workouts` })).toBeVisible()
  expect(await page.evaluate(async () => localStorage.getItem('fitness-hub-v1'))).toBeNull()
  await page.evaluate(async () => {
    await (await import('/src/workoutStorage.ts')).waitForWorkoutWrites()
    ;(window as typeof window & { __sessionPuts: string[] }).__sessionPuts = []
  })
  await page.getByRole('button', { name: /Program Workout plan/ }).click()
  await page.getByRole('button', { name: /Current program 2 days Active/ }).click()
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  const rename = page.getByRole('dialog', { name: 'Rename program' })
  await rename.getByRole('textbox', { name: 'Name' }).fill('Storage test')
  await rename.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(rename).not.toBeVisible()
  await page.evaluate(async () => { await (await import('/src/workoutStorage.ts')).waitForWorkoutWrites() })
  expect(await page.evaluate(async () => (window as typeof window & { __sessionPuts: string[] }).__sessionPuts)).toEqual([])
  await page.reload()
  await expect(page.getByRole('button', { name: `History ${expected.count} workouts` })).toBeVisible()
})

test('missing device data cannot overwrite an account using a stale sync timestamp', async ({ page }) => {
  await page.route('**/android-release.json*', route => route.fulfill({ json: { build: 77, publishedAt: 1_700_000_000_000 } }))
  await page.route('**/storage-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage fixture</title>' }))
  let uploads = 0
  await page.route('https://jrsowjbxenkrmzzknnab.supabase.co/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/app_state')) {
      if (route.request().method() !== 'GET') uploads++
      return route.fulfill({ json: { data: { sessions: [], restSeconds: 123 }, updated_at: new Date(Date.now() - 60_000).toISOString() } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/storage-fixture')
  await page.evaluate(id => {
    localStorage.setItem('fitness-hub-v1-updated-at', String(Date.now() + 60_000))
    localStorage.setItem('fitness-hub-v1-synced-account', id)
    localStorage.setItem('sb-jrsowjbxenkrmzzknnab-auth-token', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: 'test@example.com' },
    }))
  }, userId)
  await page.goto('/')
  await page.getByRole('button', { name: /^Account/ }).click()
  await expect(page.getByRole('dialog', { name: 'Account' })).toContainText('Synced')
  await expect.poll(() => page.evaluate(async () => JSON.parse((await import('/src/workoutStorage.ts')).getWorkoutDataRaw()!).restSeconds)).toBe(123)
  expect(uploads).toBe(0)
})
