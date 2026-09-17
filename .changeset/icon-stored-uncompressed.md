---
"vlc-rpc": patch
---

The app takes about five megabytes less disk space, and paints its window sooner.

- The 512 pixel icon was exported with its pixel data stored rather than
  compressed, so a flat four colour logo weighed a megabyte, and four copies of
  it are in the repository: the app icon, the build resource, the Linux icon set
  and the logo the window itself draws. Re-encoded, each is 23 kB, and the
  installed app drops from 298 MB to 293 MB.
- The download itself is the same size, because the installer's compressor was
  already squeezing those stored pixels on its way in. What changes is what
  lands on disk and what the renderer decodes at startup.
- The pixels are the same. Every fully opaque pixel is identical and the alpha
  channel is untouched; the edges differ by less than one level of 255 once
  drawn.
