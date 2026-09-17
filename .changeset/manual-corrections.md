---
"vlc-rpc": minor
---

You can now correct by hand what the app identifies wrongly, or what has no
source to come from.

- From Home, the "Correction" row opens a form already filled in with what the
  app worked out, so correcting is editing and not writing from scratch. For
  video you can change the title, the cover and whether it is a film or a
  series; for audio only the cover, because an audio file with tags takes its
  text from those tags.
- The correction always wins. It does not compete and it is not weighed against
  anything, and for audio it also beats the artwork the file carries embedded,
  which is the most common case: an MP3 with a wrong or low quality cover.
- Saving a correction clears what the app had cached for that file, so deleting
  the correction searches again for real instead of bringing the wrong answer
  back.
- Saved corrections can be seen and deleted from Settings. Each one says which
  files it applies to, because the same series under two release names counts
  as two different things, and it helps to be able to see why a correction
  stopped applying.
- If the cover URL is no good, it says why: that it is not a URL, that it does
  not answer, or that it answers with something that is not an image.
