---
"vlc-rpc": patch
---

The Windows installer now looks like the app you just downloaded.

- Setup shipped with NSIS's generic artwork: a stock header strip and, on the
  pages that have one, the default wizard panel. It now carries the cone on the
  app's own dark surface, with the product name, and the window and the entry in
  Programs and Features use the app icon rather than the NSIS one.
- The header keeps a light background on purpose, because Windows paints that
  strip white and draws the page title over it in black.
- The bitmaps are generated from the app icon and the interface palette by
  `bun run generate:installer-art`, and committed, so a build never depends on
  having run it.
