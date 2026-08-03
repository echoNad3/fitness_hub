import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(overflow.document).toBeLessThanOrEqual(1)
}

async function expectAlignedWeekdayLabels(page: Page) {
  const labels = page.locator('.hist-tracker-weekdays span')
  await expect(labels).toHaveCount(7)

  const todayIndex = await page.evaluate(() => new Date().getDay())
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const expectedLabels = Array.from(
    { length: 7 },
    (_, offset) => dayNames[(todayIndex - offset + 7) % 7],
  )
  await expect(labels).toHaveText(expectedLabels)

  const centerOffsets = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('.hist-tracker-weekdays span'))
    const firstWeek = Array.from(document.querySelectorAll('.hist-day')).slice(0, 7)
    return headings.map((heading, index) => {
      const headingBox = heading.getBoundingClientRect()
      const dayBox = firstWeek[index].getBoundingClientRect()
      return Math.abs(
        headingBox.left + headingBox.width / 2 - (dayBox.left + dayBox.width / 2),
      )
    })
  })
  expect(Math.max(...centerOffsets)).toBeLessThanOrEqual(0.5)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ERR_NETWORK_ACCESS_DENIED')) {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
})

test('home, dialogs, settings, and workout stay usable on phone layouts', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Fitness Hub' })).toBeVisible()
  const androidTile = page.getByRole('button', { name: /Android (?:Build|Download)/ })
  await expect(androidTile).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const tileHeights = await page.locator('.home-tile').evaluateAll((tiles) =>
    tiles.map((tile) => Math.round(tile.getBoundingClientRect().height * 10) / 10),
  )
  expect(new Set(tileHeights).size).toBe(1)
  const clippedTitles = await page.locator('.home-tile-text > span').evaluateAll((titles) =>
    titles.filter((title) => title.scrollWidth > title.clientWidth + 1).map((title) => title.textContent),
  )
  expect(clippedTitles).toEqual([])

  await androidTile.click()
  await expect(page.getByRole('dialog', { name: 'Android app' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: /Settings Timer and backups/ }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: /Recovery copies/ }).click()
  await expect(page.getByRole('dialog', { name: 'Recovery copies' })).toBeVisible()
  await expect(page.getByText('Sign in to sync copies to your other devices.')).toBeVisible()
  await page.getByRole('button', { name: 'Create copy now' }).click()
  const manualCopy = page.getByRole('button', { name: /Manual copy/ })
  await expect(manualCopy).toBeVisible()
  await expect(manualCopy).toContainText('Protected')
  await manualCopy.click()
  await expect(page.getByRole('dialog', { name: 'Recovery copy' })).toBeVisible()
  await expect(page.getByText('Protected until deleted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Already current' })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Delete copy' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete recovery copy?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const recoveryDetail = page.getByRole('dialog', { name: 'Recovery copy' })
  await expect(recoveryDetail).toBeVisible()
  await recoveryDetail.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('dialog', { name: 'Recovery copies' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.page-head').getByRole('button', { name: 'Back', exact: true }).click()

  await page.getByRole('button', { name: /Start workout/ }).click()
  await page.getByRole('button', { name: /Up next Workout A/ }).click()
  await expect(page.getByRole('region', { name: 'Workout A exercises' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const attemptGuidance = page.locator('.ws-guide').first()
  await expect(attemptGuidance).toContainText('Last attempt:')
  await attemptGuidance.click()
  const attemptDialog = page.getByRole('dialog', { name: 'Last attempt' })
  await expect(attemptDialog).toContainText('Choose what happened last time.')
  await expect(attemptDialog.getByRole('button', { name: 'No attempt' })).toBeVisible()
  await attemptDialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Edit workout' }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
  await expect(page.locator('.ex-muscles').first().getByRole('button')).toHaveText([
    'Chest',
    'Back',
    'Shoulders',
    'Triceps',
    'Biceps',
    'Core',
    'Legs',
  ])
  const selectedMuscle = page.locator('.ex-muscle.sel').first()
  await expect(selectedMuscle).toHaveCSS('color', 'rgb(244, 245, 248)')
  const selectedMuscleColors = await selectedMuscle.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      background: styles.backgroundColor,
      border: styles.borderColor,
      muscle: styles.getPropertyValue('--muscle-color').trim(),
    }
  })
  expect(selectedMuscleColors.muscle).toBe('#955a6d')
  expect(selectedMuscleColors.background).toMatch(/(?:0\.22\)|, 0\.22\))/)
  expect(selectedMuscleColors.border).toMatch(/(?:0\.47\)|, 0\.47\))/)
  await expectNoHorizontalOverflow(page)
})

test('JSON backups download and can be selected repeatedly before a confirmed import', async ({ page }) => {
  await page.getByRole('button', { name: /Settings Timer and backups/ }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export backup/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^fitness-hub-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const downloaded = JSON.parse(await (await import('node:fs/promises')).readFile(downloadPath!, 'utf8'))
  expect(Array.isArray(downloaded.sessions)).toBe(true)
  await expect(page.getByText('Backup saved.')).toBeVisible()

  const backup = {
    name: 'fitness-hub-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ sessions: [], restSeconds: 123 })),
  }

  const chooseFirst = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Import backup/ }).click()
  await (await chooseFirst).setFiles(backup)
  const firstPrompt = page.getByRole('dialog', { name: 'Import this backup?' })
  await expect(firstPrompt).toContainText('A protected copy is saved first.')
  await firstPrompt.getByRole('button', { name: 'Cancel' }).click()

  // Selecting the same file again must still fire after a cancelled import.
  const chooseAgain = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Import backup/ }).click()
  await (await chooseAgain).setFiles(backup)
  await page.getByRole('dialog', { name: 'Import this backup?' }).getByRole('button', { name: 'Import' }).click()
  await expect(page.getByRole('dialog', { name: 'Import this backup?' })).toHaveCount(0)
  await expect(page.getByText('Backup imported.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fitness-hub-v1') ?? '{}').restSeconds)).toBe(123)
  await expectNoHorizontalOverflow(page)
})

test('workouts can end early or complete with clear return-home feedback', async ({ page }) => {
  await page.getByRole('button', { name: /Start workout/ }).click()
  await page.getByRole('button', { name: /Up next Workout A/ }).click()

  await expect(page.getByRole('button', { name: 'End workout early' })).toBeVisible()
  await expect(page.locator('.ws-list + .ws-end-workout')).toBeVisible()
  await expect(page.locator('.ws-head-actions').getByRole('button')).toHaveCount(1)
  const endingActionSizes = await page.evaluate(() => {
    const early = document.querySelector('.ws-end-workout')?.getBoundingClientRect()
    const timer = document.querySelector('.ws-dock-start')?.getBoundingClientRect()
    return early && timer
      ? { widthDifference: Math.abs(early.width - timer.width), heightDifference: Math.abs(early.height - timer.height) }
      : null
  })
  expect(endingActionSizes).not.toBeNull()
  expect(endingActionSizes?.widthDifference).toBeLessThanOrEqual(0.5)
  expect(endingActionSizes?.heightDifference).toBeLessThanOrEqual(0.5)
  await page.getByRole('button', { name: 'End workout early' }).click()
  const earlyConfirm = page.getByRole('dialog', { name: 'End workout early?' })
  await expect(earlyConfirm).toBeVisible()
  await expect(earlyConfirm).toContainText('Your workout and elapsed time will be saved.')
  await expectNoHorizontalOverflow(page)
  await earlyConfirm.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'End workout early' }).click()
  await page.getByRole('dialog', { name: 'End workout early?' }).getByRole('button', { name: 'End workout' }).click()
  const earlySummary = page.getByRole('dialog', { name: 'Ended early' })
  await expect(earlySummary).toBeVisible()
  await expect(earlySummary).toContainText(/0\/\d+ done · 1 min/)
  const flagCenters = await earlySummary.locator('.workout-summary-icon svg').evaluate((icon) => {
    const iconBox = icon.getBoundingClientRect()
    const circleBox = icon.parentElement?.getBoundingClientRect()
    const drawing = (icon as SVGGraphicsElement).getBBox()
    return {
      drawingCenter: drawing.x + drawing.width / 2,
      viewBoxCenter: icon.viewBox.baseVal.width / 2,
      renderedCenter: iconBox.left + iconBox.width / 2,
      circleCenter: circleBox ? circleBox.left + circleBox.width / 2 : Number.NaN,
    }
  })
  expect(Math.abs(flagCenters.drawingCenter - flagCenters.viewBoxCenter)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(flagCenters.renderedCenter - flagCenters.circleCenter)).toBeLessThanOrEqual(0.5)
  await expectNoHorizontalOverflow(page)
  await earlySummary.getByRole('button', { name: 'Home' }).click()

  await expect(page.getByRole('heading', { name: 'Fitness Hub' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Resume workout/ })).toHaveCount(0)
  await page.getByRole('button', { name: /History 1 workout/ }).click()
  await expect(page.locator('.hist-chip.ended-early')).toContainText('Ended early')
  await expect(page.locator('.hist-card').first().locator('.hist-main small').first()).toContainText('1 min')
  await expectAlignedWeekdayLabels(page)
  await expectNoHorizontalOverflow(page)

  await page.locator('.hist-card').first().getByRole('button').click()
  const endedEarlyOptions = page.getByRole('dialog', { name: 'Workout A' })
  await expect(endedEarlyOptions.getByRole('button', { name: 'Open workout' })).toBeVisible()
  await expect(endedEarlyOptions.getByRole('button', { name: 'Resume workout' })).toHaveCount(0)
  await expect(endedEarlyOptions.getByRole('button', { name: 'Edit duration' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Workout A' }).getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()

  await page.getByRole('button', { name: /Start workout/ }).click()
  await page.getByRole('button', { name: /Up next Workout B/ }).click()
  const exerciseCount = await page.locator('.ws-list > .ws-item').count()
  expect(exerciseCount).toBeGreaterThan(0)
  for (let index = 0; index < exerciseCount; index += 1) {
    await page.locator('.ws-item.open').getByRole('button', { name: 'Done', exact: true }).click()
  }

  const completeSummary = page.getByRole('dialog', { name: 'Workout complete' })
  await expect(completeSummary).toBeVisible()
  await expect(completeSummary).toContainText(`${exerciseCount}/${exerciseCount} done · 1 min`)
  await expect(completeSummary.locator('.workout-summary-burst')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await completeSummary.getByRole('button', { name: 'Home' }).click()

  await page.getByRole('button', { name: /History 2 workouts/ }).click()
  await expect(page.locator('.hist-chip.done')).toContainText('Completed')
  await expect(page.locator('.hist-chip.ended-early')).toContainText('Ended early')
  const completedCard = page.locator('.hist-card').filter({ has: page.locator('.hist-chip.done') })
  await completedCard.getByRole('button').click()
  const completedOptions = page.getByRole('dialog', { name: 'Workout B' })
  await expect(completedOptions.getByRole('button', { name: 'Open workout' })).toBeVisible()
  await expect(completedOptions.getByRole('button', { name: 'Resume workout' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('large histories render in fast pages without changing totals', async ({ page }) => {
  await page.evaluate(() => {
    const now = Date.now()
    const sessions = Array.from({ length: 120 }, (_, index) => ({
      id: `history-${index}`,
      workoutId: 'workout-a',
      createdAt: now - (index + 1) * 60_000,
      groupEntries: {},
    }))
    localStorage.setItem('fitness-hub-v1', JSON.stringify({ sessions }))
  })
  await page.reload()
  await page.getByRole('button', { name: /History 120 workouts/ }).click()

  await expect(page.locator('.hist-card')).toHaveCount(50)
  await expect(page.getByText('120', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Show older workouts 50 of 120 shown/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: /Show older workouts/ }).click()
  await expect(page.locator('.hist-card')).toHaveCount(100)
  await expect(page.getByRole('button', { name: /Show older workouts 100 of 120 shown/ })).toBeVisible()
})

test('progress keeps load and estimated 1RM attempts aligned on phone layouts', async ({ page }) => {
  await page.evaluate(() => {
    const now = Date.now()
    const makeSession = (
      id: string,
      ageDays: number,
      weight: number,
      reps: number,
      result: 'success' | 'failure',
    ) => {
      const createdAt = now - ageDays * 24 * 60 * 60 * 1000
      return {
        id,
        workoutId: 'workout-a',
        createdAt,
        finishedAt: createdAt + 60 * 60 * 1000,
        groupEntries: {
          'incline-db-chest-press': {
            activeVariantId: 'incline-db-chest-press',
            entries: {
              'incline-db-chest-press': { weight, reps, perHand: true, result },
            },
          },
        },
      }
    }
    const makeFlySession = (id: string, ageDays: number, weight: number, reps: number) => {
      const createdAt = now - ageDays * 24 * 60 * 60 * 1000
      return {
        id,
        workoutId: 'workout-b',
        createdAt,
        finishedAt: createdAt + 60 * 60 * 1000,
        groupEntries: {
          'seated-cable-chest-fly': {
            activeVariantId: 'seated-cable-chest-fly',
            entries: {
              'seated-cable-chest-fly': { weight, reps, perHand: false, result: 'success' },
            },
          },
        },
      }
    }
    localStorage.setItem(
      'fitness-hub-v1',
      JSON.stringify({
        sessions: [
          makeSession('progress-old', 150, 32, 7, 'success'),
          makeFlySession('progress-fly', 120, 9, 11),
          makeSession('progress-recent', 20, 34, 8, 'success'),
          makeSession('progress-failed', 10, 36, 8, 'failure'),
        ],
      }),
    )
  })
  await page.reload()
  await page.getByRole('button', { name: /History 4 workouts/ }).click()
  const historyTopLayout = await page.evaluate(() => {
    const progress = document.querySelector('.hist-analysis-link')?.getBoundingClientRect()
    const firstStat = document.querySelector('.hist-stat')?.getBoundingClientRect()
    const pageHeader = document.querySelector('.page-head')
    const progressElement = document.querySelector('.hist-analysis-link')
    const statsElement = document.querySelector('.hist-stats')
    return progress && firstStat && pageHeader && progressElement && statsElement
      ? {
          heightDifference: Math.abs(progress.height - firstStat.height),
          followsHeader: pageHeader.nextElementSibling === progressElement,
          precedesStats: Boolean(progressElement.compareDocumentPosition(statsElement) & Node.DOCUMENT_POSITION_FOLLOWING),
        }
      : null
  })
  expect(historyTopLayout).not.toBeNull()
  expect(historyTopLayout?.heightDifference).toBeLessThanOrEqual(0.5)
  expect(historyTopLayout?.followsHeader).toBe(true)
  expect(historyTopLayout?.precedesStats).toBe(true)
  await page.getByRole('button', { name: /Progress Track load and estimated 1RM/ }).click()

  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
  await expect(page.locator('.progress-controls').getByRole('button')).toHaveCount(13)
  await expect(page.locator('.progress-series-count')).toHaveText('2 exercises')
  await expect(page.locator('.progress-legend-row')).toHaveCount(2)
  await expect(page.locator('.progress-series-path')).toHaveCount(1)
  await expect(page.locator('.progress-point')).toHaveCount(4)
  await expect(page.locator('.progress-point.failed')).toHaveCount(1)
  await expect(page.getByText('72 kg', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'Estimated 1RM' }).click()
  await expect(page.locator('.progress-point')).toHaveCount(4)
  await expect(page.locator('.progress-point.failed')).toHaveCount(1)
  await expect(page.getByText('88.9 kg', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Last 3 months' }).click()
  await expect(page.locator('.progress-point')).toHaveCount(2)
  await expect(page.locator('.progress-series-path')).toHaveCount(1)

  await page.getByRole('button', { name: 'Back to History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
