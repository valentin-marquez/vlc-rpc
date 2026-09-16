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

// Add isQuitting property and wasLaunchedAtStartup property to app
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
	// Detect if app was launched at startup
	const launchArgs = process.argv.slice(1).join(" ").toLowerCase()
	app.wasLaunchedAtStartup =
		launchArgs.includes("--autostart") ||
		launchArgs.includes("--startup") ||
		launchArgs.includes("--launch-at-login") ||
		launchArgs.includes("--autorun")

	// Assigned once the composition root below runs inside whenReady(). A
	// second-instance launch racing that window is a pre-existing edge case,
	// not something this refactor introduces: showWindow() no-ops instead of
	// throwing if it fires first.
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

		app.on("browser-window-created", (_, browserWindow) => {
			optimizer.watchWindowShortcuts(browserWindow)
		})

		configService.set("version", app.getVersion())
		logger.info(`Set app version in config: ${app.getVersion()}`)

		// Services with no dependency on another feature
		const systemClock = new SystemClock()
		const vlc = new Vlc.Client()
		const discord = new Discord.Client(systemClock)
		const imageProxy = new Media.ImageProxy()
		const coverStore = new Cover.Store()
		const coverUploader = new Cover.Uploader()
		const updater = new Updates.Updater()
		const startup = new App.Startup()

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
		const musicResolver = new Music.Resolver(
			musicCache,
			new Music.ITunesProvider(),
			new Music.MusicBrainzProvider(),
			new Music.CoverArtArchive(),
			overridesStore,
		)
		const artwork = new Artwork.Resolver(cover, musicResolver)
		const presence = new Presence.Service(artwork, catalogResolver)

		// The tray/window cycle, resolved in fixed order
		const tray = new App.Tray(startup, discord)
		window = new App.Window(discord, tray)
		tray.setWindow(window)

		// Handlers, one per feature
		new App.AppInfoHandler(startup)
		new Cover.MetadataHandler(coverStore)
		new Media.MediaInfoHandler(artwork, catalogResolver, vlc, imageProxy)
		// Both resolvers, because the key alone does not say which cache holds what
		// the correction replaces, and each one answers only for its own keys.
		new Overrides.Handler(overridesStore, [catalogResolver, musicResolver])
		new Updates.UpdateHandler(updater)
		new Vlc.VlcConfigHandler(vlc)
		new Vlc.VlcStatusHandler(vlc)
		const discordRpcHandler = new Discord.DiscordRpcHandler(discord, vlc, presence, systemClock)

		const mainWindowPromise = window.createWindow()

		mainWindowPromise.then((mainWindow) => {
			updater.setMainWindow(mainWindow)
		})

		const startWithSystem = configService.get("startWithSystem")
		startup.setStartAtLogin(startWithSystem)

		discordRpcHandler.startUpdateLoop()

		setTimeout(() => {
			updater.checkForUpdates(true)
		}, 3000)

		app.on("activate", () => {
			window?.showWindow()
		})

		app.on("before-quit", () => {
			app.isQuitting = true
		})
	})
}
