# Fitness Hub brand artwork

`fitness-hub-logo.svg` is the only master logo file. It is the original vector supplied by the
project owner.

Do not redraw it, trace it, replace it with a screenshot, or hand-edit one of its generated copies.
Run this after an intentional logo change:

```sh
npm run brand:sync
```

The command rebuilds the web icons, Android launcher assets, legacy Android splash images, and the
native Android vector artwork. `npm test` and `npm run build` reject stale or substituted files.

The Android notification icon uses the same geometry in monochrome because Android small icons are
silhouettes. It is generated too, not a separate drawing.

Some operating-system icon slots require PNG or ICO files. Those are allowed only when this pipeline
generates them directly from the master SVG. App-controlled surfaces should use the SVG or generated
Android vector drawable.
