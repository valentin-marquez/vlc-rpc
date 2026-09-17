---
"vlc-rpc": major
---

The whole interface was rebuilt to look like Discord.

It is a major change because what you operate is a different thing: anyone who
opens the app again will not know it.

- Navigation lives in the top bar, and the connection status of VLC and of
  Discord can now be seen from any screen, not only from Home.
- Usable height came back: the window footer is gone, and so is the navigation
  bar that took up a strip of its own.
- Home now shows, side by side, what VLC reports and what was sent to Discord,
  which is this app's whole job, so a wrong cover or a wrong title is visible
  at once.
- Colours, text sizes and spacing were rebuilt on a single scale calibrated
  against Discord. Text is no longer pure white, which was what gave it that
  hard look.
- Keyboard focus is now visible everywhere. The focus ring used to be the same
  colour as the primary button, which is to say invisible.
- The first run setup screen no longer runs off the window, and it was
  shortened so there is nothing to scroll.
- Animations are built on spring curves. With "reduce motion" on, the movement
  is dropped but the fades stay, so nothing appears abruptly with no
  explanation.
- Choosing what the presence shows now works with the keyboard and is
  announced properly.
