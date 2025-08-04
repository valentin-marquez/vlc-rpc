import { electronApp, optimizer } from "@electron-toolkit/utils"
import { app } from "electron"
import { mainHandlers } from "./handlers"
import { autoUpdaterService } from "./services/auto-updater"
import { configService } from "./services/config"
import { logger } from "./services/logger"
import { startupService } from "./services/startup"
import { trayService } from "./services/tray"
import { windowService } from "./services/window"

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

	app.on("second-instance", () => {
		logger.info("Another instance tried to launch, focusing our window instead")
		windowService.showWindow()
	})

	app.on("window-all-closed", (): void => {
		const minimizeToTray = configService.get<boolean>("minimizeToTray")
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

		app.on("browser-window-created", (_, window) => {
			optimizer.watchWindowShortcuts(window)
		})

		configService
		configService.set("version", app.getVersion())
		logger.info(`Set app version in config: ${app.getVersion()}`)

		mainHandlers

		// Initialize tray service before window service
		trayService

		// Initialize window service
		const mainWindowPromise = windowService.createWindow()

		// Initialize auto-updater service after window is created
		mainWindowPromise.then((mainWindow) => {
			autoUpdaterService.setMainWindow(mainWindow)
		})

		const startWithSystem = configService.get<boolean>("startWithSystem")
		startupService.setStartAtLogin(startWithSystem)

		mainHandlers.discordRpcHandler.startUpdateLoop()

		setTimeout(() => {
			autoUpdaterService.checkForUpdates(true)
		}, 3000)

		app.on("activate", () => {
			windowService.showWindow()
		})

		app.on("before-quit", () => {
			app.isQuitting = true
		})
	})
}
