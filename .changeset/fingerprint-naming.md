---
"vlc-rpc": minor
---

An audio file with no tags that the app identifies by its sound now shows in
Discord under its real name, not the file's.

- The acoustic fingerprint used to be good only for the cover. The app knew
  "Probablemente" by Christian Nodal was playing and Discord read "Christian
  Nodal - Probablemente (Official Lyric Video)", which is a file name with
  YouTube noise inside it.
- Setting the name asks for more confidence than setting the cover. A cover
  that is turned down leaves an honest gap, whereas text is always shown, so
  replacing it calls for a surer match. A match that is good enough for one and
  not for the other gives you the cover and leaves the text as it was.
- A correction written by hand still beats everything, and a file with tags of
  its own is still read from its tags. This changes only what happens when the
  tags name nothing.
- The panel on Home now says when the name came from the sound and not from the
  file, with a button next to it to go back to what the file says. That
  rejection is saved as one more correction: it shows up in the list in
  Settings and is removed from there.
