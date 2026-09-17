---
"vlc-rpc": minor
---

Audio files with no embedded artwork now get a cover.

- Before, if the file carried no art inside it, Discord showed the app's
  generic image. The song is now identified from its tags and the cover is
  looked up, first on iTunes and then on MusicBrainz plus Cover Art Archive.
- There is nothing to configure and no account to create: neither service asks
  for credentials.
- If no reliable match is found, no cover is shown, instead of risking the
  wrong one.
- The result is cached, so playing the same album again does not repeat the
  lookup.
