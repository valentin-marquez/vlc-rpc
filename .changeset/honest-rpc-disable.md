---
"vlc-rpc": patch
---

Turning the Rich Presence off now actually turns it off.

- Disabling the presence, permanently or for a while, wrote the setting and
  changed the tray menu, but the check that guards every update always answered
  "enabled". Your activity kept reaching Discord while the app told you it was
  hidden.
- The check now reads the setting and the temporary window, so a disable takes
  effect on the next update and a temporary one expires on its own.
- Disabling also clears what Discord is already showing, instead of leaving the
  last thing you played pinned to your profile.
- The tray menu asks the same check rather than working the answer out again,
  so the label cannot disagree with what is being published.
