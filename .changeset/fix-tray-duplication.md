---
"vlc-rpc": patch
---

Fix tray icon duplication after system sleep/wake cycles and code cleanup

This release fixes a critical issue where the system tray icon would duplicate itself after the system goes to sleep and wakes up. Additionally, the codebase has been cleaned up to remove support for Linux and macOS platforms, focusing exclusively on Windows.

**Bug Fixes:**

- Fixed tray keepalive condition that caused unnecessary reinitializations
- Added proper system power event handling (suspend/resume, lock-screen/unlock-screen)
- Added protection against multiple tray initializations
- Improved tray destruction and cleanup logic
- Reduced keepalive check frequency from 30s to 60s to be less aggressive

**Code Cleanup:**

- Removed macOS and Linux platform-specific code from tray service
- Simplified window creation logic to Windows-only configuration
- Removed unnecessary platform checks and conditional logic
- Cleaned up unused imports and platform-specific assets

**Developer Improvements:**

- Added `getTrayState()` method for debugging tray issues
- Enhanced logging for tray operations and system events
- Better error handling during tray destruction
