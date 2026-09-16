---
"vlc-rpc": minor
---

Covers now reach Discord as fast as the quickest file host, not as slowly as the worst one.

- The cover upload used to walk the file hosts one at a time, so a host that was
  down or slow was paid for in full, timeout included, before the next one was
  tried. It now uploads to all of them at once and keeps the first url that
  comes back.
- As soon as one host answers, the uploads still in flight are cancelled, so the
  race costs bandwidth only until it is decided.
- tempfile.org joins the pool, replacing tmpfiles.org, whose download link no
  longer serves the file, it redirects to an html page instead.
- A host that answers with an error or with something that is not a url no
  longer takes its turn away from the others, it simply loses the race.
