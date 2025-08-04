# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-08-03

### 🚨 BREAKING CHANGES

- **Dropped support for macOS and Linux distributions**
  - VLC Discord RP now focuses exclusively on Windows to ensure the highest quality experience
  - This allows for faster development cycles and better platform-specific optimizations
  - Users on macOS and Linux can continue using version 3.x until further notice

### ✨ Added

- **Windows-Optimized Experience**: Enhanced performance and stability specifically for Windows
- **Improved Error Handling**: Better recovery mechanisms and user feedback
- **Enhanced Documentation**: Updated README and documentation to reflect Windows-only support

### 🔧 Changed

- Updated build configuration to target Windows only
- Removed macOS and Linux build scripts and configurations
- Updated package description to clarify Windows support
- Streamlined CI/CD pipeline for Windows-only builds

### 🗑️ Removed

- macOS build targets and configurations
- Linux build targets and AppImage/deb/rpm packages
- Cross-platform compatibility code that's no longer needed
- macOS-specific entitlements and icons
- Linux-specific desktop integration files

### 📈 Performance

- Reduced application size by removing cross-platform dependencies
- Faster startup times due to Windows-optimized code paths
- Better memory usage through platform-specific optimizations

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
