import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Android installs one native splash controller and keeps Android 12+ on the vector surface path', async () => {
  const [activity, launchPlugin, splashVector, animatedSplash, holdAnimator, styles, packageJson, capacitorConfig, bridge] = await Promise.all([
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/MainActivity.java', 'utf8'),
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/LaunchScreenPlugin.java', 'utf8'),
    readFile('android/app/src/main/res/drawable/splash_logo_vector.xml', 'utf8'),
    readFile('android/app/src/main/res/drawable-v31/splash_logo.xml', 'utf8'),
    readFile('android/app/src/main/res/animator/splash_logo_hold.xml', 'utf8'),
    readFile('android/app/src/main/res/values/styles.xml', 'utf8'),
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
  assert.match(splashVector, /android:name="splash_vector_anchor"/)
  assert.match(animatedSplash, /<animated-vector/)
  assert.match(animatedSplash, /@drawable\/splash_logo_vector/)
  assert.match(animatedSplash, /@animator\/splash_logo_hold/)
  assert.match(holdAnimator, /android:propertyName="fillAlpha"/)
  assert.match(holdAnimator, /android:valueFrom="1\.0"/)
  assert.match(holdAnimator, /android:valueTo="1\.0"/)
  assert.match(holdAnimator, /android:duration="1"/)
  assert.match(styles, /<item name="windowSplashScreenAnimationDuration">1<\/item>/)
  assert.doesNotMatch(packageJson, /@capacitor\/splash-screen/)
  assert.doesNotMatch(capacitorConfig, /SplashScreen:/)
  assert.match(bridge, /legacySplashScreen\.hide/)
})
