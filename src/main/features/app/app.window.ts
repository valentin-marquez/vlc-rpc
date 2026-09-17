import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Client as DiscordClient } from "@main/features/discord"
import { BrowserWindow, app, session, shell } from "electron"
import type { Tray } from "./app.tray"

export class Window {
	private mainWindow: BrowserWindow | null = null

	constructor(
		private readonly discord: DiscordClient,
		private readonly tray: Tray,
	) {
		this.registerIpcHandlers()
	}

	private registerIpcHandlers(): void {
		registerHandler("window:minimize", () => {
			this.mainWindow?.minimize()
			return undefined
		})

		registerHandler("window:maximize", () => {
			if (this.mainWindow?.isMaximized()) {
				this.mainWindow.unmaximize()
			} else {
				this.mainWindow?.maximize()
			}
			return undefined
		})

		registerHandler("window:close", () => {
			this.mainWindow?.close()
			return undefined
		})

		registerHandler("window:is-maximized", () => {
			return this.mainWindow?.isMaximized() || false
		})

		registerHandler("system:platform", () => {
			return process.platform
		})
	}

	public async createWindow(): Promise<BrowserWindow> {
		if (this.mainWindow) {
			return this.mainWindow
		}

		try {
			await this.tray.whenReady()
			logger.info("Tray is ready, proceeding with window creation")
		} catch (error) {
			logger.error(`Error waiting for tray: ${error}`)
		}

		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			callback({
				responseHeaders: {
					...details.responseHeaders,
					"Content-Security-Policy": [
						`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:;`,
					],
				},
			})
		})

		const backgroundColor = "#000000" // the chrome plane, so the launch flash matches the rail

		this.mainWindow = new BrowserWindow({
			width: 900,
			height: 680,
			minWidth: 750,
			minHeight: 600,
			show: false,
			autoHideMenuBar: true,
			backgroundColor,
			titleBarStyle: "hidden",
			trafficLightPosition: { x: 10, y: 10 },
			frame: false,
			roundedCorners: true,
			transparent: false,
			center: true,
			webPreferences: {
				preload: join(__dirname, "../preload/index.js"),
				sandbox: false,
				contextIsolation: true,
				nodeIntegration: false,
			},
		})

		this.mainWindow.on("maximize", () => {
			this.mainWindow?.webContents.send("window:maximized-change", true)
		})

		this.mainWindow.on("unmaximize", () => {
			this.mainWindow?.webContents.send("window:maximized-change", false)
		})

		this.mainWindow.on("ready-to-show", async () => {
			const isFirstRun = configService.get("isFirstRun")
			const minimizeToTray = configService.get("minimizeToTray")
			const startWithSystem = configService.get("startWithSystem")
			const launchedAtStartup = this.wasLaunchedAtStartup()

			const shouldStartMinimized =
				!isFirstRun && minimizeToTray && startWithSystem && launchedAtStartup

			if (shouldStartMinimized) {
				logger.info("Starting minimized to system tray (launched at system startup)")
			} else {
				logger.info(
					`Showing main window (isFirstRun: ${isFirstRun}, minimizeToTray: ${minimizeToTray}, startWithSystem: ${startWithSystem}, launchedAtStartup: ${launchedAtStartup})`,
				)
				this.mainWindow?.show()
			}
		})

		this.mainWindow.webContents.setWindowOpenHandler((details) => {
			shell.openExternal(details.url)
			return { action: "deny" }
		})

		// @ts-ignore - 'minimize' event exists but TypeScript definitions might be incomplete
		this.mainWindow.on("minimize", (event: Electron.Event) => {
			const minimizeToTray = configService.get("minimizeToTray")
			if (minimizeToTray) {
				event.preventDefault()
				this.mainWindow?.hide()
			}
		})

		this.mainWindow.on("close", (event) => {
			if (!app.isQuitting) {
				const minimizeToTray = configService.get("minimizeToTray")
				if (minimizeToTray) {
					event.preventDefault()
					this.mainWindow?.hide()
					return
				}
			}
		})

		this.mainWindow.on("focus", () => {
			if (!this.discord.isConnected()) {
				logger.info("Window focused, trying to reconnect to Discord")
				this.discord.connect().catch((error) => {
					logger.error(`Failed to reconnect to Discord on window focus: ${error}`)
				})
			}
		})

		this.mainWindow.on("show", () => {
			if (!this.discord.isConnected()) {
				logger.info("Window shown, trying to reconnect to Discord")
				this.discord.connect().catch((error) => {
					logger.error(`Failed to reconnect to Discord when showing window: ${error}`)
				})
			}
		})

		if (is.dev && process.env.ELECTRON_RENDERER_URL) {
			this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
		} else {
			this.mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
		}

		logger.info("Main window created")
		return this.mainWindow
	}

	private wasLaunchedAtStartup(): boolean {
		if (
			Object.prototype.hasOwnProperty.call(app, "wasLaunchedAtStartup") &&
			app.wasLaunchedAtStartup
		) {
			return true
		}

		const launchArgs = process.argv.slice(1).join(" ").toLowerCase()
		if (
			launchArgs.includes("--autostart") ||
			launchArgs.includes("--startup") ||
			launchArgs.includes("--launch-at-login") ||
			launchArgs.includes("--autorun")
		) {
			return true
		}

		if (process.platform === "win32") {
			const execPath = process.execPath.toLowerCase()
			if (execPath.includes("\\appdata\\") && !is.dev) {
				return true
			}
		}

		return false
	}

	public showWindow(): void {
		if (!this.mainWindow) {
			this.createWindow()
		} else {
			this.mainWindow.show()
			if (this.mainWindow.isMinimized()) {
				this.mainWindow.restore()
			}
			this.mainWindow.focus()
		}
	}
}
