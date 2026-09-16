---
"vlc-rpc": minor
---

Remove the TMDB API key setting, and with it the TMDB lookup for video posters.

- Getting a TMDB developer key meant filling in a long form with personal
  details, so almost nobody ever had one and the route was already dead on
  nearly every install
- The TMDB API Key card is gone from Settings, and any key you had saved is
  no longer read or sent anywhere
- Anime keeps resolving posters and canonical titles through AniList, exactly
  as before
- Movies and western TV now show the local title without a poster, instead of
  a lookup that could not run. A keyless television provider is planned to
  fill that gap
