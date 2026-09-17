---
"vlc-rpc": minor
---

Audio with no useful tags, typically what you download from YouTube, now gets a
cover too.

- Before, a file with no artist and a title that is really just the file name
  had no way of being looked up: no text search can hit that. The song is now
  identified by the sound itself, by working out an acoustic fingerprint of the
  audio and asking AcoustID which recording it is.
- It runs last, only once the manual correction, the artwork embedded in the
  file and the search by tags have all failed. It is the most expensive step in
  the chain and the only one whose usage limit is shared by everyone using the
  app.
- If the answer is not clear, nothing is shown: the service has to be sure of
  the match, and the runner up must not be right behind it with a different
  artist. Among several releases, the studio album is preferred over a
  compilation.
- What comes back is cached per file, not per tags, so two files with no tags
  never share a cover and the audio is read only once.
- It needs an application key built in at compile time. A copy of the repo
  without that key behaves exactly as it did before.
