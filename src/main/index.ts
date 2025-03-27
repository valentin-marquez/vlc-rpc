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
	// Try to detect if launched at startup by checking startup/login arguments
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
		if (process.platform !== "darwin") {
			const minimizeToTray = configService.get<boolean>("minimizeToTray")
			if (!minimizeToTray) {
				app.quit()
			}
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

		// Set app user model id for windows - use the same ID as in electron-builder.yml
		electronApp.setAppUserModelId("com.valentinmarquez.vlcdiscordrp")

		// Default open or close DevTools by F12 in development
		// and ignore CommandOrControl + R in production.
		// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
		app.on("browser-window-created", (_, window) => {
			optimizer.watchWindowShortcuts(window)
		})

		configService
		configService.set("version", app.getVersion())
		logger.info(`Set app version in config: ${app.getVersion()}`)

		mainHandlers

		// Initialize tray service first (so it's available when window decides to hide)
		trayService

		// Initialize window service (will check if should start minimized)
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
