---
"vlc-rpc": major
---

VLC Discord RP v4.0.0 - Windows-Focused Major Update

## 🚨 BREAKING CHANGES

**Windows-only support**: This version drops support for macOS and Linux to focus exclusively on delivering the best Windows experience. Users on other platforms should continue using v3.x releases.

**Why this change was made:**
- Allows for faster development cycles and better platform-specific optimizations
- Enables focus on Windows-specific features and performance improvements
- Reduces maintenance overhead and improves code quality

**How to update:**
- Windows users: Upgrade normally - all settings will be automatically migrated
- macOS/Linux users: Continue using v3.x releases for cross-platform support

## ✨ Major New Features

### Discord RPC Tray Controls
- Quick RPC Toggle: Enable/disable Discord RPC directly from system tray
- Temporary Disable: Disable RPC for 15 minutes, 1 hour, or 2 hours with automatic re-activation
- Smart Timers: Timer persistence control with intuitive defaults
- Dynamic Menu: Tray shows remaining time when RPC is temporarily disabled

### Enhanced Media Detection
- Smart Activity Types: Correctly shows 'Listening to {artist}' for music and 'Watching {series/movie}' for videos
- Content Type Detection: Added support for music videos and documentaries
- Advanced Analysis: Uses @ctrl/video-filename-parser for better series/movie identification

### Local Metadata System
- Direct File Access: Extracts album cover art from audio file metadata
- Cloud Upload & Caching: Uploads covers to https://0x0.st/ with local caching for better performance
- No More Remote Searches: Eliminates need for remote fingerprinting for audio files
- Cache Management: New setting to clear metadata cache when needed

### Technical Improvements
- Electron Vite Migration: Faster builds and improved development experience
- Changesets Integration: Automated versioning and professional changelog generation
- Video Analyzer: Intelligent content type detection service
- Portable Detection: Enhanced portable version handling

## 🔧 Improvements
- Better Connection Stability: Updated Discord libraries and improved reconnection logic
- Tray Icon Management: Fixed duplication issues after system sleep/wake cycles
- File Handling: Proper URL decoding for files with special characters
- Settings UI: Simplified interface with version info moved to Application Settings
- Build System: Fixed portable build generation issues

## 🐛 Bug Fixes
- Fixed tray icon duplication after system sleep/wake cycles
- Resolved album art loading for files with spaces and special characters
- Fixed portable build configuration problems
- Improved Discord connection reliability
- Enhanced error handling and recovery mechanisms
