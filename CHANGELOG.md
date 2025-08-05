# Changelog

## 5.0.0

### Major Changes

- [`d6709d1`](https://github.com/valentin-marquez/vlc-rpc/commit/d6709d1f245b0b168ad820557573493194fa3132) Thanks [@valentin-marquez](https://github.com/valentin-marquez)! - VLC Discord RP v4.0.0 - Windows-Focused Major Update

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

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-08-05

### 🚨 BREAKING CHANGES

- **Dropped support for macOS and Linux distributions**
  - VLC Discord RP now focuses exclusively on Windows to ensure the highest quality experience
  - This allows for faster development cycles and better platform-specific optimizations
  - Users on macOS and Linux can continue using version 3.x until further notice
- **CI/CD Workflows now Windows-only**: Removed Linux and macOS build jobs from all workflows

### ✨ Added

- **Discord RPC Tray Controls**: Complete RPC management from system tray
  - Quick RPC Toggle: Enable/disable Discord RPC permanently from tray menu
  - Temporary Disable Options: Disable RPC for predefined durations (15 minutes, 1 hour, 2 hours)
  - Timer Persistence Control: New setting to control whether RPC timers persist across app restarts
  - Dynamic Menu Updates: Tray menu shows remaining time when RPC is temporarily disabled
  - Automatic Re-activation: RPC automatically re-enables when temporary timer expires
- **Enhanced Media Type Detection**:
  - Added support for music_video and documentary content types
  - Improved video identification methods with advanced content analysis
  - Better media state detection for accurate Discord status
- **Metadata Management System**:
  - New metadata handler for centralized metadata operations
  - Image uploader service for uploading cover art to 0x0.st with metadata tagging
  - Metadata writer service for improved metadata management
  - Video analyzer service for content type determination
- **Application Features**:
  - Portable version detection and handling
  - App info handler for system information
  - Automated issue response templates for better support
- **Developer Experience**:
  - Changesets integration for automated versioning and changelog generation
  - GitHub Actions CI/CD pipeline with automated releases
  - PR bot for changeset validation and contributor guidance
  - Migration to Electron Vite for improved build performance

### 🔧 Changed

- **Media Detection Improvements**:
  - Replaced MediaActivityType enum with ActivityType from discord-api-types
  - Expanded VlcRawStatus with new properties for better media tracking
  - Added VlcStreamInfo and VlcMetadata interfaces for detailed media information
  - Implemented VlcPlaylistResponse and VlcPlaylistItem interfaces
- **Settings UI Simplification**:
  - Moved version and installation type info to Application Settings
  - Removed manual update check buttons (updates now automatic)
  - Updated minimize to tray behavior (only applies to minimize button, not close)
  - Hide "Start with System" option for portable versions
- **Build Configuration**:
  - Updated to target Windows only
  - Fixed portable build generation issues
  - Streamlined resource paths and configurations
  - Updated electron-builder configuration for better artifact naming

### � Fixed

- **Tray Management**: Resolved tray icon duplication after system sleep/wake cycles
- **File Handling**: Fixed album art loading for files with spaces or special characters using proper URL decoding
- **Build Issues**: Fixed portable version generation problems with NSIS configuration
- **Code Quality**: Removed unused comments and improved code clarity

### 🗑️ Removed

- macOS and Linux build targets and configurations
- Cross-platform compatibility code
- Manual update check controls from settings UI
- Unused MediaActivityType enum
- Redundant code and comments

### 📈 Performance

- **Windows-Optimized Experience**: Enhanced performance and stability specifically for Windows
- **Electron Vite Migration**: Faster build times and improved development experience
- **Reduced Bundle Size**: Removed cross-platform dependencies
- **Better Resource Management**: Improved memory usage and faster startup times

---

## [3.0.0] - Previous Release

### ✨ Added

- Cross-Platform Support for Windows, macOS, and Linux
- Automatic Updates system
- Smart Content Detection for TV shows, movies, and anime
- Activity Type Precision (Listening/Watching)
- Modern UI with light/dark theme support
- Tray Integration for background operation

### 🔧 Changed

- Complete UI redesign
- Improved reconnection logic
- Enhanced error handling

### 🐛 Fixed

- Connection stability issues
- Media detection accuracy
- Memory leaks in long-running sessions
