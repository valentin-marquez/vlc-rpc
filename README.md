# VLC Discord Rich Presence
<div align="center">
    <img src="assets/vlc_ios.png" alt="VLC Discord RP Logo" width="200" height="200" style="border-radius: 10px;" />
</div>

> *"Because your friends totally need to know you're watching Shrek for the 17th time."*

## What's New in Version 2.0.0

🎉 **Major Update!** 🎉

- **New Web Interface Method**: Completely reworked to use VLC's HTTP interface (`http://localhost:port/requests/status.json`) for more reliable media tracking
- **Improved Audio Media Support**: Better detection and display of audio metadata
- **System Tray Integration**: App now lives in your system tray for easy access and control
- **Album Cover Display**: Your Discord status now shows album/media covers for a more visual experience
- **Auto-Detection**: Smarter VLC instance detection to minimize setup hassle
- **Automatic VLC Configuration**: The installer now automatically configures VLC's HTTP interface for you

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

Built initially during a questionable 10-hour coding marathon and now significantly improved with proper sleep and planning!

## Installation

### The Easy Way

1. Download the latest installer from the [releases page](https://github.com/valentin-marquez/vlc-discord-rp/releases)
2. Run the installer (`VLC Discord RP Setup.exe`)
3. Follow the on-screen instructions
4. Click "Install Now"
5. Let the installer do its magic ✨
6. Enjoy your new Discord flex powers!

### The Hard Way (For Developers and Masochists)

1. Clone this repo
2. Install requirements: `pip install -r requirements.txt`
3. Run `python build.py all` to build both the app and installer
4. Look in the `dist` folder for your shiny new executables

## How It Works

1. The application connects to VLC's Web Interface (automatically enabled if needed)
2. Media information is retrieved via HTTP requests to `http://localhost:{port}/requests/status.json`
3. Album artwork and media metadata are extracted and formatted
4. This information is relayed to Discord's Rich Presence API
5. Your friends wonder why you're watching cooking videos at 3 AM
6. Social validation achieved! 🎉

## FAQ

### Q: Why isn't anything showing up in Discord?
**A:** Make sure:
1. Both VLC and Discord are running
2. VLC's Web Interface is enabled (the app should enable this automatically)
3. You're playing a media file
4. Check the app in your system tray for status information
5. If issues persist, right-click the tray icon and select "Troubleshoot"

### Q: How do I close/exit the app?
**A:** Right-click the app icon in your system tray and select "Exit". Much more civilized than Task Manager now!

### Q: Where is it installed?
**A:** By default, the app installs to `%LOCALAPPDATA%\VLC Discord RP`.

### Q: Does it work on Mac/Linux?
**A:** Currently tested on Windows only. Could work elsewhere with manual installation, but you're on your own there, brave explorer.

### Q: How much of my privacy am I giving up?
**A:** Only the title, artist, album info, and cover art from your media files are shared - and only with your Discord friends. We don't collect any data. Also, you can pause the sharing via the tray icon menu.

### Q: I found a bug!
**A:** That's not a question, but I respect your enthusiasm. Please open an issue on GitHub with details about what went wrong.

### Q: Why did you make this?
**A:** The voices told me to. Also, it seemed like a fun project.

## Support The Project

If you enjoy this app and want to support its development, consider buying me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nozzdev)

## Development Notes

This project has evolved from a sleepless-night hack to a more robust application with:
- Proper error handling
- System tray integration
- Web interface utilization
- Cover art extraction and display

Pull requests are welcome if you want to help improve things further!

## License

MIT License - Feel free to use, modify, and distribute as you see fit.

---

*Made with ❤️ and significantly less sleep deprivation this time*