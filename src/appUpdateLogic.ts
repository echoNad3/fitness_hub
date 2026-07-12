type DownloadedUpdate = {
  status: string
  build?: number
}

export function isDownloadedBuildInstallable(
  update: DownloadedUpdate,
  latestBuild: number | null,
  installedBuild: number | null,
) {
  if (update.status !== 'ready' && update.status !== 'permission-required') {
    return false
  }

  const downloadedBuild = update.build ?? null
  if (downloadedBuild === null) {
    return false
  }

  if (latestBuild !== null && downloadedBuild === latestBuild) {
    return true
  }

  return (
    latestBuild !== null &&
    installedBuild !== null &&
    latestBuild <= installedBuild &&
    downloadedBuild === installedBuild
  )
}
