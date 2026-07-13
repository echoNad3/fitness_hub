import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const checkOnly = process.argv.includes('--check')
const canonicalRelativePath = 'brand/fitness-hub-logo.svg'
const canonicalPath = path.join(root, canonicalRelativePath)
const canonicalSvg = await readFile(canonicalPath, 'utf8')
const approvedArtwork = {
  viewBox: '0 0 1024 1024',
  background: { x: 0, y: 0, width: 1024, height: 1024, rx: 0, fill: '#252730' },
  mark: [
    { x: 116, y: 388, width: 112, height: 248, rx: 32, fill: '#F4F5F8' },
    { x: 246, y: 322, width: 112, height: 380, rx: 32, fill: '#F4F5F8' },
    { x: 376, y: 456, width: 272, height: 112, rx: 32, fill: '#6074F3' },
    { x: 666, y: 322, width: 112, height: 380, rx: 32, fill: '#F4F5F8' },
    { x: 796, y: 388, width: 112, height: 248, rx: 32, fill: '#F4F5F8' },
  ],
}
const safeAreaScale = 0.7

function parseAttributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )
}

function parseRect(source) {
  const attributes = parseAttributes(source)
  const number = (name, fallback = '0') => Number(attributes[name] ?? fallback)
  return {
    x: number('x'),
    y: number('y'),
    width: number('width'),
    height: number('height'),
    rx: number('rx'),
    fill: attributes.fill?.toUpperCase(),
  }
}

const svgAttributes = parseAttributes(canonicalSvg.match(/<svg\b([^>]*)>/)?.[1] ?? '')
const rects = [...canonicalSvg.matchAll(/<rect\b([^>]*)\/>/g)].map((match) => parseRect(match[1]))
const actualArtwork = {
  viewBox: svgAttributes.viewBox,
  background: rects[0],
  mark: rects.slice(1),
}

if (
  JSON.stringify(actualArtwork) !== JSON.stringify(approvedArtwork) ||
  rects.length !== 6 ||
  /<(?:image|filter|path|use)\b/i.test(canonicalSvg)
) {
  throw new Error(
    `${canonicalRelativePath} no longer matches the approved Fitness Hub vector. ` +
      'If the owner intentionally changes the design, update approvedArtwork in this script in the same reviewed change.',
  )
}

const artworkFingerprint = createHash('sha256')
  .update(JSON.stringify(approvedArtwork))
  .digest('hex')
  .slice(0, 16)
const generatedNotice = `Generated from ${canonicalRelativePath} (${artworkFingerprint}). Do not edit.`

function roundedRectPath({ x, y, width, height, rx }) {
  const right = x + width
  const bottom = y + height
  return [
    `M${x + rx},${y}`,
    `H${right - rx}`,
    `A${rx},${rx} 0 0 1 ${right},${y + rx}`,
    `V${bottom - rx}`,
    `A${rx},${rx} 0 0 1 ${right - rx},${bottom}`,
    `H${x + rx}`,
    `A${rx},${rx} 0 0 1 ${x},${bottom - rx}`,
    `V${y + rx}`,
    `A${rx},${rx} 0 0 1 ${x + rx},${y}`,
    'Z',
  ].join(' ')
}

function scaleRectAroundCenter(rect, scale) {
  const left = Math.round(512 + (rect.x - 512) * scale)
  const top = Math.round(512 + (rect.y - 512) * scale)
  const right = Math.round(512 + (rect.x + rect.width - 512) * scale)
  const bottom = Math.round(512 + (rect.y + rect.height - 512) * scale)
  return {
    ...rect,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rx: Math.round(rect.rx * scale),
  }
}

function androidVector(
  sizeDp,
  { scale = safeAreaScale, monochrome = false, bakeScale = false, animationAnchor = false } = {},
) {
  const mark = bakeScale
    ? approvedArtwork.mark.map((rect) => scaleRectAroundCenter(rect, scale))
    : approvedArtwork.mark
  const paths = mark
    .map(
      (rect, index) =>
        `        <path${animationAnchor && index === 0 ? ' android:name="splash_vector_anchor"' : ''} android:fillColor="${monochrome ? '#FFFFFFFF' : rect.fill}" android:pathData="${roundedRectPath(rect)}" />`,
    )
    .join('\n')

  const renderedPaths =
    bakeScale || scale === 1
      ? paths.replace(/^ {8}/gm, '    ')
      : `    <group
        android:pivotX="512"
        android:pivotY="512"
        android:scaleX="${scale}"
        android:scaleY="${scale}">
${paths}
    </group>`

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${generatedNotice} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${sizeDp}dp"
    android:height="${sizeDp}dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
${renderedPaths}
</vector>
`
}

function animatedSplashVectorXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${generatedNotice} Android 12+ keeps animated vectors on a SurfaceView instead of copying them to a bitmap. -->
<animated-vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/splash_logo_vector">
    <target
        android:name="splash_vector_anchor"
        android:animation="@animator/splash_logo_hold" />
</animated-vector>
`
}

function splashHoldAnimatorXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${generatedNotice} This 1 ms no-op preserves the exact logo while avoiding Android's static-icon bitmap copy. -->
<objectAnimator xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="1"
    android:propertyName="fillAlpha"
    android:valueFrom="1.0"
    android:valueTo="1.0"
    android:valueType="floatType" />
`
}

function markSvg(scale = 1) {
  const transform =
    scale === 1 ? '' : ` transform="translate(512 512) scale(${scale}) translate(-512 -512)"`
  const rectMarkup = approvedArtwork.mark
    .map(
      ({ x, y, width, height, rx, fill }) =>
        `    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" />`,
    )
    .join('\n')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n  <g${transform}>\n${rectMarkup}\n  </g>\n</svg>\n`,
  )
}

function adaptiveIconXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${generatedNotice} -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`
}

function makeIco(png) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(48, 6)
  header.writeUInt8(48, 7)
  header.writeUInt8(0, 8)
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(header.length, 18)
  return Buffer.concat([header, png])
}

const textOutputs = new Map([
  ['public/app-icon.svg', canonicalSvg],
  [
    'android/app/src/main/res/drawable/splash_logo.xml',
    androidVector(288, { bakeScale: true }),
  ],
  [
    'android/app/src/main/res/drawable/splash_logo_vector.xml',
    androidVector(288, { bakeScale: true, animationAnchor: true }),
  ],
  ['android/app/src/main/res/drawable-v31/splash_logo.xml', animatedSplashVectorXml()],
  ['android/app/src/main/res/animator/splash_logo_hold.xml', splashHoldAnimatorXml()],
  [
    'android/app/src/main/res/drawable/ic_stat_fitness.xml',
    androidVector(24, { scale: 1, monochrome: true }),
  ],
  ['android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', androidVector(108)],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptiveIconXml()],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveIconXml()],
])

const rasterOutputs = new Map()
const fullIcon = Buffer.from(canonicalSvg)
const safeMark = markSvg(safeAreaScale)
const fullMark = markSvg()

async function addPng(relativePath, source, width, height = width) {
  rasterOutputs.set(relativePath, await sharp(source).resize(width, height).png().toBuffer())
}

await addPng('public/apple-touch-icon-180x180.png', fullIcon, 180)
await addPng('public/maskable-icon-512x512.png', fullIcon, 512)
await addPng('public/pwa-64x64.png', fullIcon, 64)
await addPng('public/pwa-192x192.png', fullIcon, 192)
await addPng('public/pwa-512x512.png', fullIcon, 512)
const faviconPng = await sharp(fullIcon).resize(48, 48).png().toBuffer()
rasterOutputs.set('public/favicon.ico', makeIco(faviconPng))

const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
for (const [density, size] of Object.entries(launcherSizes)) {
  await addPng(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, fullIcon, size)
  await addPng(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, fullIcon, size)
}
for (const [density, size] of Object.entries(foregroundSizes)) {
  await addPng(
    `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
    safeMark,
    size,
  )
}

const splashSizes = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
}
for (const [relativePath, [width, height]] of Object.entries(splashSizes)) {
  const markSize = Math.round(Math.min(width, height) * 0.28)
  const mark = await sharp(fullMark).resize(markSize, markSize).png().toBuffer()
  const output = await sharp({
    create: { width, height, channels: 4, background: approvedArtwork.background.fill },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
  rasterOutputs.set(`android/app/src/main/res/${relativePath}`, output)
}

function equalBuffers(left, right) {
  return left.length === right.length && left.equals(right)
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n')
}

async function equalPngPixels(actual, expected) {
  const [actualImage, expectedImage] = await Promise.all([
    sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(expected).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  return (
    JSON.stringify(actualImage.info) === JSON.stringify(expectedImage.info) &&
    equalBuffers(actualImage.data, expectedImage.data)
  )
}

function extractIcoPng(ico) {
  if (ico.length < 22 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 1) return null
  const length = ico.readUInt32LE(14)
  const offset = ico.readUInt32LE(18)
  if (offset + length > ico.length) return null
  return ico.subarray(offset, offset + length)
}

const stale = []
if (checkOnly) {
  for (const [relativePath, expected] of textOutputs) {
    try {
      const actual = await readFile(path.join(root, relativePath), 'utf8')
      if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) stale.push(relativePath)
    } catch {
      stale.push(relativePath)
    }
  }
  for (const [relativePath, expected] of rasterOutputs) {
    try {
      const actual = await readFile(path.join(root, relativePath))
      const matches = relativePath.endsWith('.ico')
        ? await equalPngPixels(extractIcoPng(actual) ?? Buffer.alloc(0), extractIcoPng(expected))
        : await equalPngPixels(actual, expected)
      if (!matches) stale.push(relativePath)
    } catch {
      stale.push(relativePath)
    }
  }
} else {
  for (const [relativePath, contents] of [...textOutputs, ...rasterOutputs]) {
    await writeFile(path.join(root, relativePath), contents)
  }
}

const requiredReferences = [
  ['index.html', ['%BASE_URL%app-icon.svg', '<img', 'app-icon.svg']],
  ['vite.config.ts', ['app-icon.svg', 'pwa-64x64.png', 'pwa-192x192.png', 'pwa-512x512.png']],
  ['android/app/src/main/res/values/styles.xml', ['@drawable/splash_logo']],
]
for (const [relativePath, needles] of requiredReferences) {
  const contents = await readFile(path.join(root, relativePath), 'utf8')
  if (needles.some((needle) => !contents.includes(needle))) stale.push(`${relativePath} (brand reference)`)
}
const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8')
if (indexHtml.includes('<svg')) stale.push('index.html (hand-copied inline SVG)')

if (stale.length > 0) {
  throw new Error(
    `Brand assets are stale or misconfigured:\n- ${[...new Set(stale)].join('\n- ')}\n` +
      'Run npm run brand:sync, then review and commit every generated change.',
  )
}

console.log(
  checkOnly
    ? `Brand check passed: ${canonicalRelativePath} is the protected source for every logo asset.`
    : `Brand assets rebuilt from ${canonicalRelativePath}.`,
)
