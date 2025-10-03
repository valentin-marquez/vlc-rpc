# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.2] - 2025-10-02

### Fixed

**Image Upload Service Issues**

- Fixed HTTP 403 errors when uploading cover art images
- Resolved User-Agent blocking issues with 0x0.st service
- Improved upload reliability and success rates

### Added

**Multi-Service Image Upload System**

- Implemented automatic fallback between multiple image hosting services
- Added support for x0.at, catbox.moe, uguu.se, tmpfiles.org, and 0x0.st
- User-Agent rotation system to prevent service blocking
- Intelligent service selection based on file size limits
- Automatic retry logic with different services on failure

### Improved

- Enhanced error handling and logging for image upload operations
- Better service reliability through diversified hosting providers
- Reduced dependency on single image hosting service

## [4.0.1] - 2025-08-05

### BREAKING CHANGES

- Dropped support for macOS and Linux platforms to focus exclusively on Windows optimization
- Removed cross-platform CI/CD workflows and build configurations

### Added

**Discord RPC Tray Controls**

- System tray integration for Discord RPC management
- Quick toggle functionality for enabling/disabling RPC
- Temporary disable options (15 minutes, 1 hour, 2 hours)
- Real-time countdown display in tray menu when temporarily disabled

**Enhanced Media Detection System**

- Support for additional content types: `music_video` and `documentary`
- Improved video content analysis algorithms
- Enhanced media state detection for more accurate Discord status updates
- Better identification methods for various media formats

**Metadata Management Infrastructure**

- Centralized metadata handler with IPC communication system
- Image uploader service with 0x0.st integration for cover art hosting
- Automated video analyzer for content type determination
- Metadata writer service for improved data management

**Development Tools and Build System**

- Migration to Electron Vite build system for improved performance and developer experience
- Enhanced GitHub Actions CI/CD pipeline
- Simplified manual release workflow
- Issue response templates for better support

### Changed

**User Interface**

- Simplified settings interface by removing manual update controls
- Relocated application information to dedicated settings section
- Updated minimize-to-tray behavior for better user experience
- Hidden system startup options for portable installations
- Improved layout and scrolling behavior

**API and Type System**

- Replaced custom `MediaActivityType` enum with `ActivityType` from discord-api-types
- Enhanced `VlcRawStatus` interface with additional properties for better media tracking
- Introduced new interfaces: `VlcStreamInfo`, `VlcMetadata`, `VlcPlaylistResponse`, and `VlcPlaylistItem`
- Improved type safety across the application

**Build Configuration**

- Updated build targets to Windows-only architecture
- Fixed portable version generation issues
- Streamlined resource paths and build configurations
- Improved artifact naming conventions in electron-builder

### Fixed

- Resolved tray icon duplication issues occurring after system sleep/wake cycles
- Fixed album art loading problems for files with special characters or spaces in filenames using `url.fileURLToPath()`
- Corrected portable build generation with proper NSIS configuration
- Improved code quality by removing unused comments and redundant implementations

### Removed

- macOS and Linux build targets and platform-specific code
- Cross-platform compatibility layers and dependencies
- Manual update check functionality from user interface
- Deprecated `MediaActivityType` enum
- Legacy code comments and unused implementations
- Changesets workflow (simplified to manual releases)

---

## [3.0.0] - Previous Release

### Added

- Cross-platform support for Windows, macOS, and Linux operating systems
- Automatic updates system with seamless installation process
- Smart content detection for TV shows, movies, and anime content
- Activity type precision with listening and watching states
- Modern user interface with light and dark theme support
- System tray integration for background operation management

### Changed

- Complete user interface redesign with improved usability
- Enhanced VLC reconnection logic for better stability
- Improved error handling and user feedback systems

### Fixed

- Connection stability issues with VLC Media Player
- Media detection accuracy for various file formats
- Memory leaks in long-running application sessions
