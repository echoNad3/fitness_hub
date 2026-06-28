import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const resRoot = path.join(root, 'android', 'app', 'src', 'main', 'res')
const appIcon = await readFile(path.join(root, 'public', 'app-icon.svg'))
const foreground = await readFile(path.join(root, 'resources', 'android-foreground.svg'))

async function findFiles(directory, filename) {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(fullPath, filename)))
    } else if (entry.name === filename) {
      matches.push(fullPath)
    }
  }
  return matches
}

for (const filename of ['ic_launcher.png', 'ic_launcher_round.png']) {
  for (const file of await findFiles(resRoot, filename)) {
    const { width, height } = await sharp(file).metadata()
    const output = await sharp(appIcon).resize(width, height).png().toBuffer()
    await writeFile(file, output)
  }
}

for (const file of await findFiles(resRoot, 'ic_launcher_foreground.png')) {
  const { width, height } = await sharp(file).metadata()
  const output = await sharp(foreground).resize(width, height).png().toBuffer()
  await writeFile(file, output)
}

for (const file of await findFiles(resRoot, 'splash.png')) {
  const { width, height } = await sharp(file).metadata()
  const markSize = Math.round(Math.min(width, height) * 0.28)
  const mark = await sharp(appIcon).resize(markSize, markSize).png().toBuffer()
  const output = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#252730',
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
  await writeFile(file, output)
}
