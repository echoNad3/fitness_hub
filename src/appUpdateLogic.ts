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

  if (installedBuild === null) {
    return false
  }

  if (latestBuild === null) {
    // The APK itself is still package-validated by the native plugin. When release metadata is
    // temporarily unavailable, permit a same/newer downloaded build but never a downgrade.
    return downloadedBuild >= installedBuild
  }

  return latestBuild <= installedBuild && downloadedBuild === installedBuild
}
