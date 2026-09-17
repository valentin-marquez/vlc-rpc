---
"vlc-rpc": minor
---

An update now announces itself with a button in the window header, and only
when there is one.

- The button appears beside the VLC and Discord chips the moment a release is
  found, and there is nothing there the rest of the time. No greyed out control
  and no pill saying you are up to date: an empty header is the ordinary state,
  so the button showing up is the whole signal.
- It says which version and what pressing it does. An installed copy reads
  "Update to 5.0.0", downloads it and restarts to finish. A portable copy reads
  "Get 5.0.0" and goes to the release page, because a portable build cannot
  replace the file it is running from. Hovering or tabbing to it opens a panel
  that spells out what happens, and pressing it does that and nothing else.
- While the update downloads, the button becomes the progress: the version and
  the percent as text, so the reduced motion setting never costs you the number.
  If the download dies it says so and can be taken up again.
- The corner notification and the two modal dialogs that used to announce the
  same release are gone. Three ways to hear about one update was two too many,
  and the dialogs had a worse problem: answering "Later" once meant the offer
  never came back until the next version. The button stays until the update is
  taken.
- The release is now state the window can ask for rather than a message it had
  to be listening for. The first check runs three seconds after the app starts,
  which is before the window has finished loading, so an update found early used
  to be invisible until the next release came along. Closing the window and
  opening it again builds a new one, and that one is now told about the update
  too, which it never was before.
