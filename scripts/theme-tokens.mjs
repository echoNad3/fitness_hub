import { readFileSync } from 'node:fs'
import path from 'node:path'

export const THEME_SOURCE = 'src/theme.css'

export function readThemeTokens(root = process.cwd()) {
  const css = readFileSync(path.join(root, THEME_SOURCE), 'utf8')
  return Object.fromEntries(
    [...css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  )
}

export function requireHexThemeToken(tokens, name) {
  const value = tokens[name]
  if (!/^#[0-9a-f]{6}$/i.test(value ?? '')) {
    throw new Error(`${name} must be a six-digit hex colour in ${THEME_SOURCE}.`)
  }
  return value.toLowerCase()
}
