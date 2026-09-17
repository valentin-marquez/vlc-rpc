---
"vlc-rpc": minor
---

Video files now show a real poster and title instead of a raw filename.

- Video files are identified against AniList, so Discord shows the cover and
  the canonical title of what you are watching.
- Series episodes and films are read from the file name, including season and
  episode when they are there.
- When nothing matches with confidence no cover is shown, instead of risking
  the wrong one: Discord falls back to the VLC logo. Today that is the case for
  western film and television, which show a title and no poster.
