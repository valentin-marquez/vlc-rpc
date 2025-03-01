# VLC Discord Rich Presence
<div align="center">
    <img src="assets/vlc_ios.png" alt="VLC Discord RP Logo" width="200" height="200" style="border-radius: 10px;" />
</div>

> *"Because your friends totally need to know you're watching Shrek for the 17th time."*

## What Is This Thing?

VLC Discord Rich Presence is a magical little bridge between your VLC Media Player and Discord, letting your friends see what media you're currently enjoying (or enduring). It shows:

- What you're watching/listening to
- Artist and album info (for music)
- Play/pause status
- Fancy icons and progress bars

Built during a questionable 10-hour coding marathon fueled by caffeine and poor life decisions (1AM-11AM), this app works surprisingly well despite its sleep-deprived origins!

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

1. The extension adds a Lua script to VLC that tracks what you're playing
2. This script creates and continuously updates a file at `%APPDATA%\vlc\vlc_discord_status.json` with your current media information
3. The background application reads this JSON file and relays the information to Discord's Rich Presence API
4. Your friends wonder why you're watching cooking videos at 3 AM
5. Social validation achieved! 🎉

## FAQ

### Q: Why isn't anything showing up in Discord?
**A:** Make sure:
1. Both VLC and Discord are running
2. The extension is activated in VLC (View -> Discord RP)
3. You're playing a media file
4. The app was added to Windows startup during installation (it needs to be running to work)
5. Due to VLC limitations, you may need to re-enable the extension when you first open VLC (not needed when switching media files while VLC remains open)
6. If it's enabled but still not showing, try forcing an update by clicking View -> Discord RP -> Update Now

You can check the VLC console (Ctrl+M) for any errors. If issues persist, please report them in the GitHub Issues section.

### Q: How do I close/exit the app?
**A:** The app runs silently in the background. To close it, find `VLC Discord Presence.exe` in Task Manager and end the process. Yes, I know, very user-friendly. I was sleepy, okay?

### Q: Where is it installed?
**A:** By default, the app installs to `%LOCALAPPDATA%\VLC Discord RP`. The Lua extension goes to `%APPDATA%\vlc\lua\extensions`.

### Q: Does it work on Mac/Linux?
**A:** Currently tested on Windows only. Could work elsewhere with manual installation, but you're on your own there, brave explorer.

### Q: How much of my privacy am I giving up?
**A:** Only the title, artist, and album info from your media files are shared - and only with your Discord friends. We don't collect any data. Also, you can pause the sharing by closing VLC.

### Q: I found a bug!
**A:** That's not a question, but I respect your enthusiasm. Please open an issue on GitHub with details about what went wrong.

### Q: Why did you make this?
**A:** The voices told me to. Also, it seemed like a fun project.



## Development Notes

This project was created in one sleepless night from 1AM to 11AM, which explains:
- Some questionable code decisions
- The lack of proper error handling in places
- Why the uninstaller is a batch file (it just works™)
- The dependency on Task Manager to close it

Pull requests are welcome if you want to improve things while I catch up on sleep!

## License

MIT License - Feel free to use, modify, and distribute as you see fit.

---

*Made with ❤️ and sleep deprivation*

*"It works on my machine!"* - Developer motto