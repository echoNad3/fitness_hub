import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { requireHexThemeToken, readThemeTokens, THEME_SOURCE } from './theme-tokens.mjs'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')
const tokens = readThemeTokens(root)
const background = requireHexThemeToken(tokens, '--bg').slice(1).toUpperCase()
const outputPath = 'android/app/src/main/res/values/theme_colors.xml'
const expected = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from ${THEME_SOURCE}. Do not edit. -->
<resources>
    <color name="fitness_hub_background">#FF${background}</color>
</resources>
`

async function sourceFiles(relativeDirectory) {
  const entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(relativePath))
    if (entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name)) files.push(relativePath)
  }
  return files
}

if (checkOnly) {
  const current = await readFile(path.join(root, outputPath), 'utf8').catch(() => '')
  if (current.replace(/\r\n/g, '\n') !== expected) {
    throw new Error(`Theme asset is stale: ${outputPath}. Run npm run theme:sync.`)
  }

  const references = [
    ['android/app/src/main/res/values/styles.xml', '@color/fitness_hub_background'],
    ['android/app/src/main/res/values/ic_launcher_background.xml', '@color/fitness_hub_background'],
  ]
  for (const [relativePath, reference] of references) {
    const contents = await readFile(path.join(root, relativePath), 'utf8')
    if (!contents.includes(reference)) {
      throw new Error(`${relativePath} must use ${reference}.`)
    }
  }

  const editableFiles = [
    'index.html',
    'vite.config.ts',
    'capacitor.config.ts',
    ...await sourceFiles('src'),
  ].filter((relativePath) => relativePath.replace(/\\/g, '/') !== THEME_SOURCE)
  const scatteredColors = []
  for (const relativePath of editableFiles) {
    const contents = await readFile(path.join(root, relativePath), 'utf8')
    if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(contents)) scatteredColors.push(relativePath)
  }
  if (scatteredColors.length > 0) {
    throw new Error(`Move colour values to ${THEME_SOURCE}: ${scatteredColors.join(', ')}.`)
  }

  console.log(`Theme check passed: app colours come from ${THEME_SOURCE}.`)
} else {
  await writeFile(path.join(root, outputPath), expected)
  console.log(`Native theme colours rebuilt from ${THEME_SOURCE}.`)
}
