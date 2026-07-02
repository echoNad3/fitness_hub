// Fetches the latest published Android APK release so the app can show which build is current,
// when it shipped, and — inside the native app — whether it's newer than the installed one.
// CI tags each APK release `android-v<runNumber>` and injects the same number into the APK's
// versionCode (see .github/workflows/android.yml + android/app/build.gradle), so the release
// number and the installed build are directly comparable.

const LATEST_RELEASE_API = 'https://api.github.com/repos/echoNad3/fitness_hub/releases/latest'

export type LatestApk = {
  // Release build number (the CI run number), or null when it can't be parsed.
  build: number | null
  // When the release was published (epoch ms), or null when unavailable.
  publishedAt: number | null
}

export async function fetchLatestApk(): Promise<LatestApk | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return null
    }
    const release = (await response.json()) as { tag_name?: unknown; name?: unknown; published_at?: unknown }
    const publishedAt = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN
    return {
      build: parseBuild(release.tag_name) ?? parseBuild(release.name),
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
    }
  } catch {
    return null
  }
}

// Pull the trailing build number out of e.g. "android-v42" or "Android APK build 42".
function parseBuild(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.match(/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}
