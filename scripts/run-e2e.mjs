import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const server = await createServer({
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
})

try {
  await server.listen()
  const exitCode = await new Promise((resolve, reject) => {
    const tests = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
      cwd: projectRoot,
      env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: '1' },
      stdio: 'inherit',
    })
    tests.once('error', reject)
    tests.once('exit', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  await server.close()
}
