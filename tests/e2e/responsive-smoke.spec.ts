import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(overflow.document).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
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
  await page.getByRole('button', { name: 'Back', exact: true }).click()

  await page.getByRole('button', { name: /Start workout/ }).click()
  await page.getByRole('button', { name: /Up next Workout A/ }).click()
  await expect(page.getByRole('region', { name: 'Workout A exercises' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'Edit workout' }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
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
