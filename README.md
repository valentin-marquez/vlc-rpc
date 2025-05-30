# VLC Discord Rich Presence

<div align="center">
    <img src="resources/icon.png" alt="VLC Discord RP Logo" width="200" height="200" style="border-radius: 10px;" />
</div>

> _"Because your friends totally need to know you're watching Shrek for the 17th time."_

## What's New in Version 3.0.0

🎉 **Major Update Alert!** 🎉

- **Cross-Platform Support**: Now available for Windows, macOS, and Linux!
- **Automatic Updates**: Never miss a new feature with our new built-in update system
- **Smart Content Detection**: Better identification of TV shows, movies, and anime
- **Activity Type Precision**: Shows "Listening to" for music and "Watching" for videos
- **Improved Reconnection Logic**: Automatically reconnects to Discord if connection drops
- **Enhanced Error Handling**: More robust operation with better recovery from failures
- **Modern UI**: Sleek, responsive interface with light/dark theme support
- **Tray Integration**: Keep the app running in the background for seamless tracking

### See It In Action

<div align="center">
    <img src="docs/music detection.png" alt="Music Detection" width="300" />
    <img src="docs/anime detection.png" alt="Anime Detection" width="300" />
    <img src="docs/general media.png" alt="General Media" width="300" />
    <img src="docs/paused detection.png" alt="Paused Detection" width="300" />
</div>

## What Is This Thing?

VLC Discord Rich Presence is a magical little bridge between your VLC Media Player and Discord, letting your friends see what media you're currently enjoying (or enduring). It shows:

- What you're watching/listening to
- Artist and album info (for music)
- Play/pause status
- Album/media artwork
- Fancy icons and progress bars

Built initially during a questionable 10-hour coding marathon and now significantly improved with proper architecture and planning!

## Installation

### The Easy Way

1. Download the latest installer for your platform from the [releases page](https://github.com/valentin-marquez/vlc-discord-rp/releases)

- Windows: `vlc-rpc-setup.exe` or `vlc-rpc-portable.exe`
- macOS: `vlc-rpc.dmg` or `VLC-Discord-RP-arm64-mac.zip` for Apple Silicon
- Linux: `vlc-rpc_amd64.deb`, `vlc-rpc.x86_64.rpm`, or `vlc-rpc.AppImage`

2. Run the installer
3. Follow the on-screen instructions
4. Enjoy your new Discord flex powers!

### The Hard Way (For Developers)

1. Clone this repo
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Build for production:
   - Windows: `npm run build:win`
   - macOS: `npm run build:mac`
   - Linux: `npm run build:linux`

## How It Works

1. The application connects to VLC's Web Interface (automatically enabled if needed)
2. Media information is retrieved via HTTP requests to `http://localhost:{port}/requests/status.json`
3. Advanced content detection identifies what you're watching
4. Album artwork and media metadata are extracted and formatted
5. This information is relayed to Discord's Rich Presence API
6. Social validation achieved! 🎉

## FAQ

### Q: Why isn't anything showing up in Discord?

**A:** Make sure:

1. Both VLC and Discord are running
2. VLC's Web Interface is enabled (the app should enable this automatically)
3. You're playing a media file
4. Check the app for status information
5. If issues persist, try the reconnect button in settings

### Q: How do I close/exit the app?

**A:** Right-click the app icon in your system tray (Windows/Linux) or menu bar (macOS) and select "Exit". Or use the close button in the main window.

### Q: Where is it installed?

**A:** Default installation locations:

- Windows: `%LOCALAPPDATA%\VLC Discord RP`
- macOS: `/Applications/VLC Discord RP.app`
- Linux: `/opt/vlc-discord-rp` or `/usr/bin/vlc-discord-rp`

### Q: Does it work on Mac/Linux?

**A:** Yes! Version 3.0 fully supports Windows, macOS, and Linux with native installers for each platform.

### Q: How much of my privacy am I giving up?

**A:** Only the title, artist, album info, and cover art from your media files are shared - and only with your Discord friends. We don't collect any data. Also, you can pause the sharing via the tray/menu bar icon.

### Q: I found a bug!

**A:** That's not a question, but I respect your enthusiasm. Please open an issue on GitHub with details about what went wrong.

### Q: Will this get me banned from Discord?

**A:** No! This app uses Discord's official Rich Presence API which is designed exactly for this purpose.

### Q: Why did you make this?

**A:** The voices told me to. Also, it seemed like a fun project.

## Support The Project

If you enjoy this app and want to support its development, consider buying me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nozzdev)

## Development Notes

This project has evolved from a sleepless-night hack to a robust application with:

- Cross-platform compatibility
- Proper error handling
- System tray/menu bar integration
- Web interface utilization
- Cover art extraction and display
- Automatic updates

### Contributing

We use [Changesets](https://github.com/changesets/changesets) for version management and changelog generation. Here's how to contribute:

1. **Fork and clone** the repository
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and commit them
4. **Create a changeset**: `bun run changeset`
   - Choose the appropriate version bump (patch/minor/major)
   - Write a clear description of your changes
5. **Commit the changeset**: `git add .changeset/ && git commit -m "docs: add changeset"`
6. **Push and create a PR**

For detailed information about our changeset workflow, see [docs/CHANGESETS.md](docs/CHANGESETS.md).

#### Development Scripts

```bash
# Development
bun run dev              # Start development server
bun run build           # Build for production

# Code Quality
bun run lint            # Run linter
bun run format          # Format code
bun run typecheck       # Type checking

# Changesets
bun run changeset       # Create a changeset
bun run changeset:status # Check changeset status

# Platform Builds
bun run build:win       # Build for Windows
bun run build:mac       # Build for macOS
bun run build:linux     # Build for Linux
```

Pull requests are welcome if you want to help improve things further!

## License

MIT License - Feel free to use, modify, and distribute as you see fit.

---

_Made with ❤️ and significantly less sleep deprivation this time_
