import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const expectedBuild = Number(process.env.ANDROID_BUILD || 0)

if (!repository || !token) {
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.')
}

let build = NaN
let publishedAt = NaN

for (let attempt = 0; attempt < 6; attempt += 1) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'fitness-hub-pages-build',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Latest Android release lookup failed with HTTP ${response.status}.`)
  }

  const release = await response.json()
  const match = typeof release.tag_name === 'string' ? release.tag_name.match(/^android-v(\d+)$/) : null
  build = match ? Number(match[1]) : NaN
  publishedAt = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN

  if (!expectedBuild || build === expectedBuild) {
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}

if (!Number.isInteger(build) || build <= 0 || !Number.isFinite(publishedAt)) {
  throw new Error('Latest Android release metadata is malformed.')
}
if (expectedBuild && build !== expectedBuild) {
  throw new Error(`Expected Android build ${expectedBuild}, but latest release is build ${build}.`)
}

const target = path.join(process.cwd(), 'public', 'android-release.json')
await writeFile(target, `${JSON.stringify({ build, publishedAt })}\n`, 'utf8')
console.log(`Wrote Android build ${build} metadata to ${target}`)
