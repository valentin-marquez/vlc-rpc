import { existsSync } from "node:fs"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import { SystemClock } from "@main/core/clock"
import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import * as App from "@main/features/app"
import * as Artwork from "@main/features/artwork"
import * as Catalog from "@main/features/catalog"
import * as Cover from "@main/features/cover"
import * as Discord from "@main/features/discord"
import * as Media from "@main/features/media"
import * as Music from "@main/features/music"
import * as Overrides from "@main/features/overrides"
import * as Presence from "@main/features/presence"
import * as Updates from "@main/features/updates"
import * as Vlc from "@main/features/vlc"
import { app } from "electron"

declare global {
	namespace Electron {
		interface App {
			isQuitting: boolean
			wasLaunchedAtStartup: boolean
		}
	}
}

app.isQuitting = false
app.wasLaunchedAtStartup = false

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
	logger.info("Another instance is already running. Quitting this one.")
	app.quit()
} else {
	const launchArgs = process.argv.slice(1).join(" ").toLowerCase()
	app.wasLaunchedAtStartup =
		launchArgs.includes("--autostart") ||
		launchArgs.includes("--startup") ||
		launchArgs.includes("--launch-at-login") ||
		launchArgs.includes("--autorun")

	// Assigned once the composition root below runs inside whenReady(). A
	// second-instance launch that beats it finds undefined and no-ops.
	let window: App.Window | undefined

	app.on("second-instance", () => {
		logger.info("Another instance tried to launch, focusing our window instead")
		window?.showWindow()
	})

	app.on("window-all-closed", (): void => {
		const minimizeToTray = configService.get("minimizeToTray")
		if (!minimizeToTray) {
			app.quit()
		}
	})

	app.whenReady().then(() => {
		logger.info("Application starting", {
			version: app.getVersion(),
			platform: process.platform,
			arch: process.arch,
			argv: process.argv,
			wasLaunchedAtStartup: app.wasLaunchedAtStartup,
		})

		electronApp.setAppUserModelId("com.valentinmarquez.vlcdiscordrp")

		// Services with no dependency on another feature
		const systemClock = new SystemClock()
		const vlc = new Vlc.Client()
		const discord = new Discord.Client(systemClock)
		const imageProxy = new Media.ImageProxy()
		const coverStore = new Cover.Store()
		const coverUploader = new Cover.Uploader()
		// Asked once and answered once: the updater decides what it may offer from
		// this, and start at login is refused for the same copies, so the header
		// and the settings screen cannot disagree about what this copy is.
		const install = Updates.detectInstallKind(
			Updates.probeInstall(process.env, process.resourcesPath, existsSync),
		)
		const updater = new Updates.Updater(systemClock, install)
		const startup = new App.Startup(install)

		// Services that depend on the above
		const cover = new Cover.Resolver(vlc, coverStore, coverUploader)
		const overridesStore = new Overrides.Store(systemClock)
		const catalogCache = new Catalog.Cache(systemClock)
		const catalogResolver = new Catalog.Resolver(
			catalogCache,
			new Catalog.AniListProvider(),
			overridesStore,
		)
		const musicCache = new Music.Cache(systemClock)
		// Identifying audio by its sound needs a key of this application's own,
		// injected at build time. A clone without one keeps every other step of
		// the cover chain, and is told so here rather than once per track.
		//
		// electron-vite inlines the expression below before any module exists,
		// while tsconfig.node.json typechecks this file as CommonJS, where the
		// syntax is not allowed. Expecting the error rather than ignoring it: the
		// day that config changes, tsc reports the directive as unused.
		// @ts-expect-error TS1470, import.meta under a CommonJS typecheck
		const acoustIdKey: string = import.meta.env.MAIN_VITE_ACOUSTID_KEY ?? ""
		if (acoustIdKey.length === 0) {
			logger.info("Audio identification is off: this build carries no AcoustID key")
		}
		// One locator for both readers, so the playlist is read once per item and
		// not once per question. The resolver holds it unconditionally: a file
		// with no tags can only be corrected under the file itself, so gating it
		// on the key above would drop corrections from every keyless build.
		const musicLocator = new Music.Locator(vlc)
		const identifier =
			acoustIdKey.length === 0
				? undefined
				: new Music.Identifier(musicLocator, new Music.Fpcalc(), new Music.AcoustId(acoustIdKey))
		const musicResolver = new Music.Resolver(
			musicCache,
			new Music.ITunesProvider(),
			new Music.MusicBrainzProvider(),
			new Music.CoverArtArchive(),
			overridesStore,
			musicLocator,
			identifier,
		)
		const artwork = new Artwork.Resolver(cover, musicResolver)
		// The music resolver a third time, for its narrowest question: audio text
		// is built from tags, and a file that carries none has only what the user
		// typed to build it from.
		const presence = new Presence.Service(artwork, catalogResolver, musicResolver)

		// The tray/window cycle, resolved in fixed order
		const tray = new App.Tray(startup, discord)
		window = new App.Window(discord, tray)
		tray.setWindow(window)

		// Handlers, one per feature
		new App.AppInfoHandler(startup)
		new Cover.MetadataHandler(coverStore)
		new Media.MediaInfoHandler(artwork, catalogResolver, musicResolver, vlc, imageProxy)
		const discordRpcHandler = new Discord.DiscordRpcHandler(discord, vlc, presence, systemClock)
		// Both resolvers, because the key alone does not say which cache holds what
		// the correction replaces. The rpc handler, because evicting a cache does
		// not reach a presence already on screen: that loop diffs on what VLC
		// reports, which a correction leaves untouched.
		new Overrides.Handler(overridesStore, [catalogResolver, musicResolver], discordRpcHandler)
		new Updates.UpdateHandler(updater)
		new Vlc.VlcConfigHandler(vlc)
		new Vlc.VlcStatusHandler(vlc)

		app.on("browser-window-created", (_, browserWindow) => {
			optimizer.watchWindowShortcuts(browserWindow)

			// Closing the window destroys it unless it minimizes to the tray, and
			// opening it again builds another. Handing the updater only the first
			// one left every later window with no way to hear about a release.
			updater.setMainWindow(browserWindow)
		})

		void window.createWindow()

		const startWithSystem = configService.get("startWithSystem")
		startup.setStartAtLogin(startWithSystem)

		discordRpcHandler.startUpdateLoop()

		updater.start()

		app.on("activate", () => {
			window?.showWindow()
		})

		app.on("before-quit", () => {
			app.isQuitting = true
			updater.stop()
		})
	})
}
