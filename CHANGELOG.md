# Changelog

## 5.0.0

### Major Changes

- cbe4d74: The whole interface was rebuilt to look like Discord.

  It is a major change because what you operate is a different thing: anyone who
  opens the app again will not know it.

  - Navigation lives in the top bar, and the connection status of VLC and of
    Discord can now be seen from any screen, not only from Home.
  - Usable height came back: the window footer is gone, and so is the navigation
    bar that took up a strip of its own.
  - Home now shows, side by side, what VLC reports and what was sent to Discord,
    which is this app's whole job, so a wrong cover or a wrong title is visible
    at once.
  - Colours, text sizes and spacing were rebuilt on a single scale calibrated
    against Discord. Text is no longer pure white, which was what gave it that
    hard look.
  - Keyboard focus is now visible everywhere. The focus ring used to be the same
    colour as the primary button, which is to say invisible.
  - The first run setup screen no longer runs off the window, and it was
    shortened so there is nothing to scroll.
  - Animations are built on spring curves. With "reduce motion" on, the movement
    is dropped but the fades stay, so nothing appears abruptly with no
    explanation.
  - Choosing what the presence shows now works with the keyboard and is
    announced properly.

### Minor Changes

- f751bbe: Audio with no useful tags, typically what you download from YouTube, now gets a
  cover too.

  - Before, a file with no artist and a title that is really just the file name
    had no way of being looked up: no text search can hit that. The song is now
    identified by the sound itself, by working out an acoustic fingerprint of the
    audio and asking AcoustID which recording it is.
  - It runs last, only once the manual correction, the artwork embedded in the
    file and the search by tags have all failed. It is the most expensive step in
    the chain and the only one whose usage limit is shared by everyone using the
    app.
  - If the answer is not clear, nothing is shown: the service has to be sure of
    the match, and the runner up must not be right behind it with a different
    artist. Among several releases, the studio album is preferred over a
    compilation.
  - What comes back is cached per file, not per tags, so two files with no tags
    never share a cover and the audio is read only once.
  - It needs an application key built in at compile time. A copy of the repo
    without that key behaves exactly as it did before.

- 00184e4: Audio files with no embedded artwork now get a cover.

  - Before, if the file carried no art inside it, Discord showed the app's
    generic image. The song is now identified from its tags and the cover is
    looked up, first on iTunes and then on MusicBrainz plus Cover Art Archive.
  - There is nothing to configure and no account to create: neither service asks
    for credentials.
  - If no reliable match is found, no cover is shown, instead of risking the
    wrong one.
  - The result is cached, so playing the same album again does not repeat the
    lookup.

- ca4c995: Covers now reach Discord as fast as the quickest file host, not as slowly as the worst one.

  - The cover upload used to walk the file hosts one at a time, so a host that was
    down or slow was paid for in full, timeout included, before the next one was
    tried. It now uploads to all of them at once and keeps the first url that
    comes back.
  - As soon as one host answers, the uploads still in flight are cancelled, so the
    race costs bandwidth only until it is decided.
  - tempfile.org joins the pool, replacing tmpfiles.org, whose download link no
    longer serves the file, it redirects to an html page instead.
  - A host that answers with an error or with something that is not a url no
    longer takes its turn away from the others, it simply loses the race.

- 97b55dc: An audio file with no tags that the app identifies by its sound now shows in
  Discord under its real name, not the file's.

  - The acoustic fingerprint used to be good only for the cover. The app knew
    "Probablemente" by Christian Nodal was playing and Discord read "Christian
    Nodal - Probablemente (Official Lyric Video)", which is a file name with
    YouTube noise inside it.
  - Setting the name asks for more confidence than setting the cover. A cover
    that is turned down leaves an honest gap, whereas text is always shown, so
    replacing it calls for a surer match. A match that is good enough for one and
    not for the other gives you the cover and leaves the text as it was.
  - A correction written by hand still beats everything, and a file with tags of
    its own is still read from its tags. This changes only what happens when the
    tags name nothing.
  - The panel on Home now says when the name came from the sound and not from the
    file, with a button next to it to go back to what the file says. That
    rejection is saved as one more correction: it shows up in the list in
    Settings and is removed from there.

- 51c404b: The Layout screen is a builder: you drag pieces onto the lines of the Discord
  card to decide what your profile shows.

  - On the left there is a list of pieces named the way a person names them:
    Title, Artist, Album, Your own words, and for video Title, Episode, Year,
    Season number and Episode number. Under each name you see what that piece is
    worth right now, so there is nothing to guess.
  - On the right is the real Discord card, the same one drawn on Home, and its
    lines are the zones where the pieces are dropped. There is no separate
    preview: what you build is what you are looking at. Each piece you place
    shows what it draws, not the name of the field.
  - Drag and drop with the pointer: the piece lifts with a shadow, tilts a little
    and sits exactly under your finger, a grey ghost of it stays where it came
    from, and a gap the size of the piece opens in the target line before you let
    go. It settles with a spring when it lands. Dropped outside a zone, it goes
    back to its place on its own instead of disappearing.
  - It also works without dragging: pick a line, then press a piece. With the
    keyboard, the arrow keys move a piece between positions and between lines,
    and the delete key takes it out.
  - The lines are no longer a list of alternative templates. Each piece now takes
    itself out of the line when the file does not have that detail, and takes the
    words around it with it. That is why a single line works just as well for a
    series as for a film: Episode shows up in one and Year in the other, with no
    "Unknown" written out and no empty parentheses left behind.
  - The builder warns you when two lines draw the same value, which is the
    easiest mistake to make and the hardest to notice when you are looking at
    your own profile. It also warns when a line has pieces but draws nothing in
    any of the examples.
  - The Video tab no longer says "Soon" and is built the same way as the music
    one, with pieces of its own. And a pause respects the arrangement you chose
    instead of writing a format of its own.

- cbe4d74: You can now correct by hand what the app identifies wrongly, or what has no
  source to come from.

  - From Home, the "Correction" row opens a form already filled in with what the
    app worked out, so correcting is editing and not writing from scratch. For
    video you can change the title, the cover and whether it is a film or a
    series; for audio only the cover, because an audio file with tags takes its
    text from those tags.
  - The correction always wins. It does not compete and it is not weighed against
    anything, and for audio it also beats the artwork the file carries embedded,
    which is the most common case: an MP3 with a wrong or low quality cover.
  - Saving a correction clears what the app had cached for that file, so deleting
    the correction searches again for real instead of bringing the wrong answer
    back.
  - Saved corrections can be seen and deleted from Settings. Each one says which
    files it applies to, because the same series under two release names counts
    as two different things, and it helps to be able to see why a correction
    stopped applying.
  - If the cover URL is no good, it says why: that it is not a URL, that it does
    not answer, or that it answers with something that is not an image.

- 4007a68: The card on the Layout screen is now the card Discord draws, and the arrangement the app
  ships with reads the right way round.

  - Discord writes the name of the activity on the header line, straight after the verb, and
    draws three lines under it: the bold one, the one below it, and the artwork's text. The
    app believed the header carried the verb alone and that the artwork text was only ever
    shown on hover. A profile playing a file with no album read "Listening to Probablemente"
    on the header, "by Christian Nodal" in bold, and then "Listening to Music", which were
    words this app made up.
  - Nothing invented reaches a profile any more. "Listening to Music", "Watching Video" and
    "VLC Media Player" are gone, and a line your arrangement does not fill is a line Discord
    is not given.
  - The album is drawn once. It used to be sent as the artwork text and could be placed on a
    line as well, and Discord draws both.
  - The music arrangement everyone starts on is the shape of a Spotify card: the song in
    bold, who plays it under that, the album last, and the header left to Discord, which
    names the activity after the app. The one it replaces put the song on the header, so the
    bold line was the artist, the song and the artist the wrong way round. An arrangement you
    changed yourself is left exactly as you left it.
  - The builder has a slot for each of the four pieces of text, named for where the piece
    lands rather than for the top, the middle and the bottom, which is how the song ended up
    in the header in the first place. The header slot says what happens if you leave it
    empty.
  - Video is arranged the same way and draws what it always did, the title in bold with the
    episode or the year under it. It sends no artwork text at all: a Listening activity was
    seen drawing one as a line, and nothing seen says a Watching activity does the same.
  - Both tabs of the Layout screen now show the file that is playing right now, so the card
    can be held up beside your own Discord window. The examples stay under it.

- d6db3c7: An update now announces itself with a button in the window header, and only
  when there is one.

  - The button appears beside the VLC and Discord chips the moment a release is
    found, and there is nothing there the rest of the time. No greyed out control
    and no pill saying you are up to date: an empty header is the ordinary state,
    so the button showing up is the whole signal.
  - It says which version and what pressing it does. An installed copy reads
    "Update to 5.0.0", downloads it and restarts to finish. A portable copy reads
    "Get 5.0.0" and goes to the release page, because a portable build cannot
    replace the file it is running from. Hovering or tabbing to it opens a panel
    that spells out what happens, and pressing it does that and nothing else.
  - While the update downloads, the button becomes the progress: the version and
    the percent as text, so the reduced motion setting never costs you the number.
    If the download dies it says so and can be taken up again.
  - The corner notification and the two modal dialogs that used to announce the
    same release are gone. Three ways to hear about one update was two too many,
    and the dialogs had a worse problem: answering "Later" once meant the offer
    never came back until the next version. The button stays until the update is
    taken.
  - The release is now state the window can ask for rather than a message it had
    to be listening for. The first check runs three seconds after the app starts,
    which is before the window has finished loading, so an update found early used
    to be invisible until the next release came along. Closing the window and
    opening it again builds a new one, and that one is now told about the update
    too, which it never was before.
  - Settings, under About, has a "Check for updates" button for when you want to
    ask rather than wait. It answers on the spot, next to the version it checked:
    the version it found, that you are up to date, or that the check could not
    reach GitHub. No dialog, and no second install button: a release it finds is
    taken up from the header button like any other.

- da2f6aa: Video files now show a real poster and title instead of a raw filename.

  - Video files are identified against AniList, so Discord shows the cover and
    the canonical title of what you are watching.
  - Series episodes and films are read from the file name, including season and
    episode when they are there.
  - When nothing matches with confidence no cover is shown, instead of risking
    the wrong one: Discord falls back to the VLC logo. Today that is the case for
    western film and television, which show a title and no poster.

### Patch Changes

- 984bad8: Reorganize the main process by feature and remove the Google Images cover
  scraper. No other user facing behavior changes.
- 3aa72d0: The release workflow goes back to building the binaries without publishing them
  on its own.
- fafe9b0: Turning the Rich Presence off now actually turns it off.

  - Disabling the presence, permanently or for a while, wrote the setting and
    changed the tray menu, but the check that guards every update always answered
    "enabled". Your activity kept reaching Discord while the app told you it was
    hidden.
  - The check now reads the setting and the temporary window, so a disable takes
    effect on the next update and a temporary one expires on its own.
  - Disabling also clears what Discord is already showing, instead of leaving the
    last thing you played pinned to your profile.
  - The tray menu asks the same check rather than working the answer out again,
    so the label cannot disagree with what is being published.

- 783c21e: The app takes about five megabytes less disk space, and paints its window sooner.

  - The 512 pixel icon was exported with its pixel data stored rather than
    compressed, so a flat four colour logo weighed a megabyte, and four copies of
    it are in the repository: the app icon, the build resource, the Linux icon set
    and the logo the window itself draws. Re-encoded, each is 23 kB, and the
    installed app drops from 298 MB to 293 MB.
  - The download itself is the same size, because the installer's compressor was
    already squeezing those stored pixels on its way in. What changes is what
    lands on disk and what the renderer decodes at startup.
  - The pixels are the same. Every fully opaque pixel is identical and the alpha
    channel is untouched; the edges differ by less than one level of 255 once
    drawn.

- c635ce4: A video with a cover on disk shows the VLC logo again instead of no image at all.

  - When VLC found local artwork for a video, the file path it reports was sent to
    Discord as the image key, after it had already replaced the logo. Discord
    cannot read a path on your disk, so the activity ended up with no image, which
    is what western film and television got: no catalog poster and now no logo
    either.
  - Audio hit the same thing whenever the cover upload failed, since the path the
    upload was meant to replace stayed behind.
  - Only something Discord can fetch reaches the image key now, and when there is
    nothing to send the image you configured stays. Playing and paused go through
    the same rule, so they cannot disagree about it.
  - Artwork VLC reports as a url, which a stream can carry, is still sent as it
    always was.

- 338369d: The Windows installer now looks like the app you just downloaded.

  - Setup shipped with NSIS's generic artwork: a stock header strip and, on the
    pages that have one, the default wizard panel. It now carries the cone on the
    app's own dark surface, with the product name, and the window and the entry in
    Programs and Features use the app icon rather than the NSIS one.
  - The header keeps a light background on purpose, because Windows paints that
    strip white and draws the page title over it in black.
  - The bitmaps are generated from the app icon and the interface palette by
    `bun run generate:installer-art`, and committed, so a build never depends on
    having run it.

- d6db3c7: Start at login is no longer decided by looking for the word "portable" in the
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

- e789b1e: Stop writing your VLC password and TMDB key to the app log.

  - The VLC HTTP password was saved in plain text to the log every time a
    setting changed, and the TMDB API key would have ended up there too once
    you set one.
  - A failed request to TMDB could also leak the key, since TMDB takes it as
    part of the request URL.
  - The log now records that a value changed, not what the value is.
  - This fix does not clean up logs already written. If you have used this
    app before, your existing log file may still contain your VLC password,
    so it is worth deleting it, especially if you ever attached that log to
    a bug report.

- 2ef6041: The app notices a new release while it is running, not only when it starts.

  - The update check ran once, three seconds after launch, and never again. This
    app lives in the tray and starts with Windows, so a machine that stays on for
    weeks never heard about a release.
  - It now checks every six hours, and again when you open the window, which is
    when you are actually there to read the answer. Two checks can no longer
    overlap, and the timers stop when the app quits.
  - A failed check used to retry three times, five seconds apart, then give up.
    It now waits a minute, then five, then fifteen, so a laptop that is offline
    or a GitHub that is down is not asked again every few seconds.
  - The same version is announced once per run. Before, a repeated check would
    have reopened the dialog every time, and the dialog now waits until your
    window is open instead of interrupting whatever is on screen.
  - Portable builds are no longer offered a download they cannot apply. The
    update feed carries the installer, so what landed in the cache folder was
    never the portable executable the instructions told you to extract. The
    portable build now points at the release page, where the portable file is.
  - The "Install and restart" button in the update notification closed the
    window instead of installing anything. It installs and restarts now, and a
    portable copy is not shown that button at all.
  - Whether a copy is portable is now read from the launcher the portable build
    sets and from the uninstaller the installer writes, not from words in the
    path. An install in a folder called Downloads or on the Desktop was being
    treated as portable, which quietly turned off its automatic updates.
  - Update errors log the name and code of the failure instead of the whole
    error object, and the release urls that electron-updater writes to the log
    are reduced to their host.

## 4.1.0

### Minor Changes

- 2e83ff7: Make listening status format consistent between playing and paused states

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
