import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { CATEGORIES, muscleColor } from '../src/workoutPresentation.ts'

const themeCss = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8')

function themeColor(token: string) {
  const match = themeCss.match(new RegExp(`^\\s*${token}:\\s*(#[0-9a-f]{6});`, 'im'))
  assert.ok(match, `${token} is missing from theme.css`)
  return match[1].toLowerCase()
}

function resolvedMuscleColor(category: (typeof CATEGORIES)[number]) {
  const token = muscleColor(category).match(/^var\((--[^)]+)\)$/)?.[1]
  assert.ok(token, `${category} must use a theme token`)
  return themeColor(token)
}

const RESERVED_UI_COLORS = ['--accent', '--success', '--danger', '--warning'].map(themeColor)
const MIN_OKLAB_DISTANCE = 0.08
const MAX_OKLAB_CHROMA = 0.085
const MAX_OKLAB_LIGHTNESS = 0.73
const MUTED_JEWEL_PALETTE = {
  CHEST: '#955a6d',
  BACK: '#617292',
  SHOULDERS: '#5f8169',
  BICEPS: '#639a9e',
  TRICEPS: '#aa7a5a',
  CORE: '#b797a6',
  LEGS: '#9476a3',
} as const

function srgbToLinear(value: number) {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function toOklab(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = srgbToLinear(value >> 16)
  const green = srgbToLinear((value >> 8) & 255)
  const blue = srgbToLinear(value & 255)

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)

  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ]
}

function colorDistance(first: string, second: string) {
  const a = toOklab(first)
  const b = toOklab(second)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

test('muscle chips use the approved editor order', () => {
  assert.deepEqual(CATEGORIES, ['CHEST', 'BACK', 'SHOULDERS', 'TRICEPS', 'BICEPS', 'CORE', 'LEGS'])
})

test('muscle colors use the approved muted jewel palette', () => {
  for (const category of CATEGORIES) {
    assert.equal(resolvedMuscleColor(category), MUTED_JEWEL_PALETTE[category])
  }
})

test('muscle colors keep a subdued chroma', () => {
  for (const category of CATEGORIES) {
    const [lightness, a, b] = toOklab(resolvedMuscleColor(category))
    assert.ok(Math.hypot(a, b) <= MAX_OKLAB_CHROMA, `${category} is too saturated`)
    assert.ok(lightness <= MAX_OKLAB_LIGHTNESS, `${category} is too bright`)
  }
})

test('muscle colors are distinct from each other', () => {
  const colors = CATEGORIES.map((category) => [category, resolvedMuscleColor(category)] as const)

  assert.equal(new Set(colors.map(([, color]) => color)).size, CATEGORIES.length)
  for (let first = 0; first < colors.length; first += 1) {
    for (let second = first + 1; second < colors.length; second += 1) {
      const [firstName, firstColor] = colors[first]
      const [secondName, secondColor] = colors[second]
      assert.ok(
        colorDistance(firstColor, secondColor) >= MIN_OKLAB_DISTANCE,
        `${firstName} and ${secondName} are too similar`,
      )
    }
  }
})

test('muscle colors stay separate from UI status colors', () => {
  for (const category of CATEGORIES) {
    for (const reserved of RESERVED_UI_COLORS) {
      assert.ok(
        colorDistance(resolvedMuscleColor(category), reserved) >= MIN_OKLAB_DISTANCE,
        `${category} is too close to reserved color ${reserved}`,
      )
    }
  }
})
