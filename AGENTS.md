# Repository rules

## Brand artwork

- `brand/fitness-hub-logo.svg` is the only editable Fitness Hub logo source.
- Never recreate the logo, use a screenshot, or hand-edit a generated logo file.
- App-controlled UI must use the vector source or a generated vector drawable.
- PNG and ICO copies are only for operating-system slots that require them and must be generated with
  `npm run brand:sync`.
- Run `npm run brand:check` after any change involving branding, launch screens, icons, or build files.
- The Android 12+ splash must keep using `@drawable/splash_logo`, and adaptive launchers must keep
  using `@drawable/ic_launcher_foreground`.
- The Android notification mark is the generated monochrome `@drawable/ic_stat_fitness`; do not
  redraw it separately.
