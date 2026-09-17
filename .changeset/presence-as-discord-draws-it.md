---
"vlc-rpc": minor
---

The card on the Layout screen is now the card Discord draws, and the arrangement the app
ships with reads the right way round.

- Discord writes the name of the activity on the header line, straight after the verb, and
  draws three lines under it: the bold one, the one below it, and the artwork's text. The
  app believed the header carried the verb alone and that the artwork text was only ever
  shown on hover. A profile playing a file with no album read "Listening to Probablemente"
  on the header, "by Christian Nodal" in bold, and then "Listening to Music", which were
  words this app made up.
- Nothing invented reaches a profile any more. "Listening to Music", "Watching Video" and
  "VLC Media Player" are gone, and a line your arrangement does not fill is a line Discord
  is not given.
- The album is drawn once. It used to be sent as the artwork text and could be placed on a
  line as well, and Discord draws both.
- The music arrangement everyone starts on is the shape of a Spotify card: the song in
  bold, who plays it under that, the album last, and the header left to Discord, which
  names the activity after the app. The one it replaces put the song on the header, so the
  bold line was the artist, the song and the artist the wrong way round. An arrangement you
  changed yourself is left exactly as you left it.
- The builder has a slot for each of the four pieces of text, named for where the piece
  lands rather than for the top, the middle and the bottom, which is how the song ended up
  in the header in the first place. The header slot says what happens if you leave it
  empty.
- Video is arranged the same way and draws what it always did, the title in bold with the
  episode or the year under it. It sends no artwork text at all: a Listening activity was
  seen drawing one as a line, and nothing seen says a Watching activity does the same.
- Both tabs of the Layout screen now show the file that is playing right now, so the card
  can be held up beside your own Discord window. The examples stay under it.
