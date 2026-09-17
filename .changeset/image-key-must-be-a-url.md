---
"vlc-rpc": patch
---

A video with a cover on disk shows the VLC logo again instead of no image at all.

- When VLC found local artwork for a video, the file path it reports was sent to
  Discord as the image key, after it had already replaced the logo. Discord
  cannot read a path on your disk, so the activity ended up with no image, which
  is what western film and television got: no catalog poster and now no logo
  either.
- Audio hit the same thing whenever the cover upload failed, since the path the
  upload was meant to replace stayed behind.
- Only something Discord can fetch reaches the image key now, and when there is
  nothing to send the image you configured stays. Playing and paused go through
  the same rule, so they cannot disagree about it.
- Artwork VLC reports as a url, which a stream can carry, is still sent as it
  always was.
