import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function filesMatching(directory: string, extensions: ReadonlySet<string>) {
  return filesUnder(directory).filter((path) => extensions.has(extname(path)))
}

test('web vibration calls stay inside the semantic haptic service', () => {
  const offenders = filesMatching(join(root, 'src'), new Set(['.ts', '.tsx']))
    .filter((path) => relative(join(root, 'src'), path) !== 'haptics.ts')
    .filter((path) => /navigator\.vibrate|registerPlugin<.*Haptics/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path))

  assert.deepEqual(offenders, [])
})

test('Android interaction and alarm vibration paths stay separate', () => {
  const javaRoot = join(root, 'android', 'app', 'src', 'main', 'java')
  const javaFiles = filesMatching(javaRoot, new Set(['.java']))
  const interactionFiles = javaFiles
    .filter((path) => /performHapticFeedback/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path))
  const alarmFiles = javaFiles
    .filter((path) => /android\.os\.(?:VibrationEffect|Vibrator)/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path))

  assert.deepEqual(interactionFiles, [
    join('android', 'app', 'src', 'main', 'java', 'com', 'echonad3', 'fitnesshub', 'AppHapticsPlugin.java'),
  ])
  assert.deepEqual(alarmFiles, [
    join('android', 'app', 'src', 'main', 'java', 'com', 'echonad3', 'fitnesshub', 'RestVibrationReceiver.java'),
  ])
})
