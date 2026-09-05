import { expect, test, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, extname } from 'node:path'
import { build } from 'vite'

// Exercise the built app and its real Workbox worker across two web-only deployments.
// Dev mode has no service worker, so the normal gesture tests cannot catch stale-app reloads.
test.describe('installed web updates', () => {
  test.describe.configure({ mode: 'serial' })
  let output: string
  let server: Server
  let origin: string
  let version = 1
  let failWorker = false
  let holdInstall: Promise<void> | undefined
  let releaseInstall: (() => void) | undefined

  test.beforeAll(async () => {
    output = await mkdtemp(join(tmpdir(), 'fitness-hub-pwa-'))
    await build({ base: '/fitness_hub/', build: { outDir: output }, logLevel: 'silent' })
    server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost')
      const file = url.pathname.replace(/^\/fitness_hub\//, '') || 'index.html'
      try {
        if (file.includes('..') || file.startsWith('/')) throw new Error('Invalid path')
        if (file === 'sw.js' && failWorker) {
          response.writeHead(503).end()
          return
        }
        let body: string | Buffer = await readFile(join(output, file))
        if (file === 'sw.js') {
          const source = body.toString()
          body = source.replace(/(["']?url["']?\s*:\s*["']index\.html["']\s*,\s*["']?revision["']?\s*:\s*["'])[^"']+/, `$1web-${version}`)
          if (body === source) throw new Error('The generated worker has no index precache entry')
        } else if (file === 'index.html') {
          const pageVersion = version
          // Hold the new HTML precache response so refresh must await worker installation.
          await holdInstall
          body = body.toString().replace('<head>', `<head><meta name="test-web-version" content="${pageVersion}">`)
        }
        const contentType: Record<string, string> = {
          '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
          '.json': 'application/json', '.webmanifest': 'application/manifest+json',
          '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
        }
        response.writeHead(200, {
          'Content-Type': contentType[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        }).end(body)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server has no port')
    origin = `http://127.0.0.1:${address.port}/fitness_hub/`
  })

  test.afterAll(async () => {
    releaseInstall?.()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    if (output) {
      const target = await realpath(output)
      if (dirname(target) !== await realpath(tmpdir()) || !basename(target).startsWith('fitness-hub-pwa-')) {
        throw new Error('Refusing to remove a directory outside the temporary PWA fixture')
      }
      await rm(target, { recursive: true, force: true })
    }
  })

  test.beforeEach(async ({ page }) => {
    version = 1
    failWorker = false
    holdInstall = undefined
    releaseInstall = undefined
    await page.goto(origin)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    // The installed-app scenario starts with a page actually served by the old worker.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Fitness Hub' })).toBeVisible()
  })

  test.afterEach(() => {
    // Release in-flight worker fetches before Playwright closes the browser context on failure.
    releaseInstall?.()
  })

  async function pull(page: Page) {
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      const home = document.querySelector('.home')!
      for (const [type, touches] of [
        ['touchstart', [{ clientY: 20 }]], ['touchmove', [{ clientY: 280 }]], ['touchend', []],
      ] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'touches', { value: touches })
        home.dispatchEvent(event)
      }
    })
  }

  async function markPage(page: Page) {
    await page.evaluate(() => { document.documentElement.dataset.samePage = 'yes' })
  }

  const samePage = (page: Page) => page.locator('html')
  const webVersion = (page: Page) => page.locator('meta[name="test-web-version"]')

  test('one pull waits for the new web assets, reloads once, and preserves local data', async ({ page }) => {
    await markPage(page)
    const saved = await page.evaluate(() => localStorage.getItem('fitness-hub-v1'))
    expect(saved).toBeTruthy()
    version = 2
    holdInstall = new Promise<void>((resolve) => { releaseInstall = resolve })
    await pull(page)
    await expect(page.getByRole('status', { name: 'Refreshing', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.installing))).toBe(true)
    await page.waitForTimeout(900)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    await expect(webVersion(page)).toHaveAttribute('content', '1')
    releaseInstall!()
    await expect(webVersion(page)).toHaveAttribute('content', '2')
    expect(await page.evaluate(() => localStorage.getItem('fitness-hub-v1'))).toBe(saved)
    await markPage(page)
    await pull(page)
    await expect(page.getByRole('status', { name: 'Refreshing', exact: true })).toHaveCount(0)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
  })

  test('a background update keeps the current screen until an explicit pull', async ({ page }) => {
    await markPage(page)
    await page.getByRole('button', { name: /Settings Backups and other/ }).click()
    version = 2
    await page.evaluate(async () => {
      const previous = navigator.serviceWorker.controller
      window.dispatchEvent(new Event('online'))
      await new Promise<void>((resolve) => {
        const changed = () => {
          if (navigator.serviceWorker.controller !== previous) {
            navigator.serviceWorker.removeEventListener('controllerchange', changed)
            resolve()
          }
        }
        navigator.serviceWorker.addEventListener('controllerchange', changed)
        changed()
      })
    })
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    await expect(webVersion(page)).toHaveAttribute('content', '1')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await pull(page)
    await expect(webVersion(page)).toHaveAttribute('content', '2')
  })

  test('offline and failed checks leave the existing app usable', async ({ page, context }) => {
    await markPage(page)
    await context.setOffline(true)
    await pull(page)
    await expect(page.getByRole('status', { name: 'Refreshing', exact: true })).toHaveCount(0)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    failWorker = true
    await context.setOffline(false)
    await pull(page)
    await expect(page.getByRole('status', { name: 'Refreshing', exact: true })).toHaveCount(0)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    await page.getByRole('button', { name: /Settings Backups and other/ }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('leaving Home during the download defers the reload until another pull', async ({ page }) => {
    await markPage(page)
    version = 2
    holdInstall = new Promise<void>((resolve) => { releaseInstall = resolve })
    await pull(page)
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.installing))).toBe(true)
    await page.getByRole('button', { name: /Settings Backups and other/ }).click()
    releaseInstall!()
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing === null)).toBe(true)
    await page.waitForTimeout(900)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await pull(page)
    await expect(webVersion(page)).toHaveAttribute('content', '2')
  })

  test('a timed-out download cannot reload later without another pull', async ({ page }) => {
    await markPage(page)
    await page.clock.install()
    version = 2
    holdInstall = new Promise<void>((resolve) => { releaseInstall = resolve })
    await pull(page)
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.installing))).toBe(true)
    await page.clock.runFor(15_001)
    await expect(page.getByRole('status', { name: 'Refreshing', exact: true })).toHaveCount(0)
    releaseInstall!()
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing === null)).toBe(true)
    await expect(samePage(page)).toHaveAttribute('data-same-page', 'yes')
    await expect(webVersion(page)).toHaveAttribute('content', '1')
    await pull(page)
    await page.clock.runFor(1000)
    await expect(webVersion(page)).toHaveAttribute('content', '2')
  })
})
