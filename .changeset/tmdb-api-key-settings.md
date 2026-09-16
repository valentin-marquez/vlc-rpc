---
"vlc-rpc": minor
---

Add a TMDB API key card to Settings so movies and TV shows can get a poster.

- Paste your own free key from themoviedb.org, no account linking and no
  credentials held by the app
- Save and verify checks the key with TMDB before storing it, and refuses to
  store one TMDB rejects, since a bad key takes over the lookup and removes the
  posters AniList was finding
- The card says whether a key is set, confirms every save, and reports a save
  that failed instead of looking unchanged
