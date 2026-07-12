// Fetches the latest published Android APK release so the app can show which build is current,
// when it shipped, and — inside the native app — whether it's newer than the installed one.
// CI tags each APK release `android-v<runNumber>` and injects the same number into the APK's
// versionCode (see .github/workflows/android.yml + android/app/build.gradle), so the release
// number and the installed build are directly comparable.

import { getStored, setStored } from './storage.ts'

const LATEST_RELEASE_API = 'https://api.github.com/repos/echoNad3/fitness_hub/releases/latest'
const LATEST_RELEASE_CACHE_KEY = 'fitness-hub-latest-apk'

export type LatestApk = {
  // Release build number (the CI run number).
  build: number
  // When the release was published (epoch ms).
  publishedAt: number
}

export function readCachedLatestApk(): LatestApk | null {
  return parseCachedLatestApk(getStored(LATEST_RELEASE_CACHE_KEY))
}

export function parseCachedLatestApk(cached: string | null): LatestApk | null {
  if (!cached) {
    return null
  }

  try {
    return parseLatestApk(JSON.parse(cached))
  } catch {
    return null
  }
}

export async function fetchLatestApk(): Promise<LatestApk | null> {
  const manifest = await fetchLatestManifest()
  if (manifest) {
    setStored(LATEST_RELEASE_CACHE_KEY, JSON.stringify(manifest))
    return manifest
  }

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    })
    if (!response.ok) {
      return readCachedLatestApk()
    }
    const release = (await response.json()) as { tag_name?: unknown; name?: unknown; published_at?: unknown }
    const publishedAt = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN
    const latest = parseLatestApk({
      build: parseBuild(release.tag_name) ?? parseBuild(release.name),
      publishedAt,
    })
    if (!latest) {
      return readCachedLatestApk()
    }
    setStored(LATEST_RELEASE_CACHE_KEY, JSON.stringify(latest))
    return latest
  } catch {
    return readCachedLatestApk()
  }
}

async function fetchLatestManifest(): Promise<LatestApk | null> {
  if (typeof document === 'undefined') {
    return null
  }

  try {
    const url = new URL('android-release.json', document.baseURI)
    url.searchParams.set('t', String(Date.now()))
    const response = await fetch(url, { cache: 'no-store' })
    return response.ok ? parseLatestApk(await response.json()) : null
  } catch {
    return null
  }
}

export function parseLatestApk(value: unknown): LatestApk | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<LatestApk>
  return typeof candidate.build === 'number' &&
    Number.isInteger(candidate.build) &&
    candidate.build > 0 &&
    typeof candidate.publishedAt === 'number' &&
    Number.isFinite(candidate.publishedAt)
    ? { build: candidate.build, publishedAt: candidate.publishedAt }
    : null
}

// Pull the trailing build number out of e.g. "android-v42" or "Android APK build 42".
export function parseBuild(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.match(/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}
