---
"vlc-rpc": patch
---

Stop writing your VLC password and TMDB key to the app log.

- The VLC HTTP password was saved in plain text to the log every time a
  setting changed, and the TMDB API key would have ended up there too once
  you set one.
- A failed request to TMDB could also leak the key, since TMDB takes it as
  part of the request URL.
- The log now records that a value changed, not what the value is.
- This fix does not clean up logs already written. If you have used this
  app before, your existing log file may still contain your VLC password,
  so it is worth deleting it, especially if you ever attached that log to
  a bug report.
