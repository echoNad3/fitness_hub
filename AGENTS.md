# Repository rules

## Brand artwork

- `brand/fitness-hub-logo.svg` is the only editable Fitness Hub logo source.
- Never recreate the logo, use a screenshot, or hand-edit a generated logo file.
- App-controlled UI must use the vector source or a generated vector drawable.
- PNG and ICO copies are only for operating-system slots that require them and must be generated with
  `npm run brand:sync`.
- Run `npm run brand:check` after any change involving branding, launch screens, icons, or build files.
- The Android 12+ splash must keep using the generated `drawable-v31/splash_logo.xml` animated
  vector wrapper. Its 1ms no-op is deliberate: Android otherwise copies a static vector into a
  filtered bitmap. Older Android versions use the generated static `drawable/splash_logo.xml`.
  Adaptive launchers must keep using `@drawable/ic_launcher_foreground`.
- Android launch installs the system splash exactly once in `MainActivity`, before `super.onCreate`.
  Do not re-add `@capacitor/splash-screen` or another late splash installer.
- The Android notification mark is the generated monochrome `@drawable/ic_stat_fitness`; do not
  redraw it separately.
