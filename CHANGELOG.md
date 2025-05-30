# vlc-rpc

## 3.1.0

### Minor Changes

- [#11](https://github.com/valentin-marquez/vlc-rpc/pull/11) [`87f9bf4`](https://github.com/valentin-marquez/vlc-rpc/commit/87f9bf4b9d7bdf789b8b09e33caeff109052519d) Thanks [@valentin-marquez](https://github.com/valentin-marquez)! - Add Discord RPC control shortcuts in system tray menu

  This release introduces comprehensive RPC control functionality accessible directly from the system tray:

  **New Features:**

  - **Quick RPC Toggle**: Enable/disable Discord RPC permanently from tray menu
  - **Temporary Disable Options**: Disable RPC for predefined durations (15 minutes, 1 hour, 2 hours)
  - **Timer Persistence Control**: New setting to control whether RPC timers persist across app restarts (disabled by default for intuitive behavior)
  - **Dynamic Menu Updates**: Tray menu shows remaining time when RPC is temporarily disabled
  - **Automatic Re-activation**: RPC automatically re-enables when temporary timer expires

  **Technical Improvements:**

  - New IPC events for RPC control (`RPC_ENABLE`, `RPC_DISABLE`, `RPC_DISABLE_TEMPORARY`, `RPC_STATUS`)
  - Enhanced Discord RPC service with timer management
  - Configurable timer persistence behavior in Settings page
  - Improved error handling for configuration management

  **Configuration:**

  - Added `rpcEnabled` and `rpcDisabledUntil` to app configuration
  - Added `persistRpcTimersOnRestart` setting (defaults to `false` for better UX)

  This addresses issue #7 and provides users with convenient ways to quickly disable RPC when viewing private content without forgetting to re-enable it later.
