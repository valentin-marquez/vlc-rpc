---
"vlc-rpc": patch
---

Start at login is no longer decided by looking for the word "portable" in the
folder the app runs from.

The app used to answer "is this copy portable" in two different ways that could
disagree: the updater asked the build (the portable launcher sets an environment
variable, the installer leaves an uninstaller beside the executable), while start
at login lowercased the path and searched it for a word. That guess was wrong in
both directions. A portable copy in a folder that does not happen to say so was
offered start at login, which writes a registry entry pointing at a file the user
is free to move; an ordinary install under a folder like C:\PortableApps lost
start at login for no reason. Both now come from the one answer the build gives,
so the header, the "Installed as" line in Settings, the "Start with System" item
the tray menu shows only to an installed copy and the start at login switch
cannot contradict each other.
