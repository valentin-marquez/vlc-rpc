---
"vlc-rpc": patch
---

The app notices a new release while it is running, not only when it starts.

- The update check ran once, three seconds after launch, and never again. This
  app lives in the tray and starts with Windows, so a machine that stays on for
  weeks never heard about a release.
- It now checks every six hours, and again when you open the window, which is
  when you are actually there to read the answer. Two checks can no longer
  overlap, and the timers stop when the app quits.
- A failed check used to retry three times, five seconds apart, then give up.
  It now waits a minute, then five, then fifteen, so a laptop that is offline
  or a GitHub that is down is not asked again every few seconds.
- The same version is announced once per run. Before, a repeated check would
  have reopened the dialog every time, and the dialog now waits until your
  window is open instead of interrupting whatever is on screen.
- Portable builds are no longer offered a download they cannot apply. The
  update feed carries the installer, so what landed in the cache folder was
  never the portable executable the instructions told you to extract. The
  portable build now points at the release page, where the portable file is.
- The "Install and restart" button in the update notification closed the
  window instead of installing anything. It installs and restarts now, and a
  portable copy is not shown that button at all.
- Whether a copy is portable is now read from the launcher the portable build
  sets and from the uninstaller the installer writes, not from words in the
  path. An install in a folder called Downloads or on the Desktop was being
  treated as portable, which quietly turned off its automatic updates.
- Update errors log the name and code of the failure instead of the whole
  error object, and the release urls that electron-updater writes to the log
  are reduced to their host.
