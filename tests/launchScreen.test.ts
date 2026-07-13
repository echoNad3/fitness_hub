import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Android installs one native splash controller before activity creation', async () => {
  const [activity, launchPlugin, splashVector, packageJson, capacitorConfig, bridge] = await Promise.all([
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/MainActivity.java', 'utf8'),
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/LaunchScreenPlugin.java', 'utf8'),
    readFile('android/app/src/main/res/drawable/splash_logo.xml', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('capacitor.config.ts', 'utf8'),
    readFile('src/launchScreen.ts', 'utf8'),
  ])

  assert.equal((activity.match(/installSplashScreen\(this\)/g) ?? []).length, 1)
  assert.ok(activity.indexOf('installSplashScreen(this)') < activity.indexOf('super.onCreate(savedInstanceState)'))
  assert.match(activity, /registerPlugin\(LaunchScreenPlugin\.class\)/)
  assert.match(activity, /setKeepOnScreenCondition/)
  assert.match(activity, /splashScreenView\.remove\(\)/)
  assert.match(launchPlugin, /hideLaunchSplash\(\)/)
  assert.doesNotMatch(splashVector, /<group/)
  assert.doesNotMatch(packageJson, /@capacitor\/splash-screen/)
  assert.doesNotMatch(capacitorConfig, /SplashScreen:/)
  assert.match(bridge, /legacySplashScreen\.hide/)
})
