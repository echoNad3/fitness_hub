import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuild, parseCachedLatestApk } from '../src/apkVersion.ts'
import { isDownloadedBuildInstallable } from '../src/appUpdateLogic.ts'

test('Android release build numbers parse from CI tags and names', () => {
  assert.equal(parseBuild('android-v123'), 123)
  assert.equal(parseBuild('Android APK build 456'), 456)
  assert.equal(parseBuild('android-current'), null)
  assert.equal(parseBuild(null), null)
})

test('cached Android release metadata is accepted only when complete and valid', () => {
  assert.deepEqual(parseCachedLatestApk('{"build":123,"publishedAt":500}'), { build: 123, publishedAt: 500 })
  assert.deepEqual(parseCachedLatestApk('{"build":null,"publishedAt":null}'), { build: null, publishedAt: null })
  assert.equal(parseCachedLatestApk('{"build":0,"publishedAt":500}'), null)
  assert.equal(parseCachedLatestApk('{"build":123}'), null)
  assert.equal(parseCachedLatestApk('not-json'), null)
})

test('only the latest downloaded Android build can be installed as an update', () => {
  assert.equal(isDownloadedBuildInstallable({ status: 'ready', build: 12 }, 12, 11), true)
  assert.equal(isDownloadedBuildInstallable({ status: 'permission-required', build: 12 }, 12, 11), true)
  assert.equal(isDownloadedBuildInstallable({ status: 'ready', build: 11 }, 12, 11), false)
  assert.equal(isDownloadedBuildInstallable({ status: 'ready' }, 12, 11), false)
  assert.equal(isDownloadedBuildInstallable({ status: 'downloading', build: 12 }, 12, 11), false)
  assert.equal(isDownloadedBuildInstallable({ status: 'ready', build: 12 }, 12, 12), true)
})
