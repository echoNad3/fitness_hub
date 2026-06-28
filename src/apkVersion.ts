// Fetches the version label of the latest published Android APK so the Settings download button
// can show what build it points to. The CI tags each APK release `android-v<runNumber>` (see
// .github/workflows/android.yml), so the run number is the human-facing build number.

const LATEST_RELEASE_API = 'https://api.github.com/repos/echoNad3/fitness_hub/releases/latest'

export async function fetchLatestApkVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return null
    }
    const release = (await response.json()) as { tag_name?: unknown; name?: unknown }
    return formatVersion(release.tag_name) ?? formatVersion(release.name)
  } catch {
    return null
  }
}

function formatVersion(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  // Pull the trailing build number out of e.g. "android-v42" or "Android APK build 42".
  const match = value.match(/(\d+)\s*$/)
  if (match) {
    return `Build ${match[1]}`
  }
  return value.trim() || null
}
