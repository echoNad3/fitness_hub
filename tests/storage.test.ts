import assert from 'node:assert/strict'
import test from 'node:test'
import { getStored, removeStored, setStored } from '../src/storage.ts'

test('storage failures never throw and are reported to the caller', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    },
  })

  try {
    assert.equal(getStored('key'), null)
    assert.equal(setStored('key', 'value'), false)
    assert.equal(removeStored('key'), false)
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous)
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  }
})

test('successful storage writes are confirmed', () => {
  const values = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })

  try {
    assert.equal(setStored('key', 'value'), true)
    assert.equal(getStored('key'), 'value')
    assert.equal(removeStored('key'), true)
    assert.equal(getStored('key'), null)
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous)
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  }
})
