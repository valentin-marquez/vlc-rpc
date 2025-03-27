import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import icon from "@resources/icons/128x128.png?asset"
import { BrowserWindow, app, ipcMain, session, shell } from "electron"
import { configService } from "./config"
import { discordRpcService } from "./discord-rpc"
import { logger } from "./logger"
import { trayService } from "./tray"

/**
 * Window management service
 */
export class WindowService {
	private static instance: WindowService | null = null
	private mainWindow: BrowserWindow | null = null

	private constructor() {
		// Register window control IPC listeners
		this.registerIpcHandlers()
	}

	/**
	 * Get the singleton instance of the window service
	 */
	public static getInstance(): WindowService {
		if (!WindowService.instance) {
			WindowService.instance = new WindowService()
		}
		return WindowService.instance
	}

	/**
	 * Register IPC handlers for window controls
	 */
	private registerIpcHandlers(): void {
		ipcMain.handle("window:minimize", () => {
			this.mainWindow?.minimize()
		})

		ipcMain.handle("window:maximize", () => {
			if (this.mainWindow?.isMaximized()) {
				this.mainWindow.unmaximize()
			} else {
				this.mainWindow?.maximize()
			}
		})

		ipcMain.handle("window:close", () => {
			this.mainWindow?.close()
		})

		ipcMain.handle("window:isMaximized", () => {
			return this.mainWindow?.isMaximized() || false
		})

		ipcMain.handle("system:platform", () => {
			return process.platform
		})

		// Listen for maximize/unmaximize events to update the UI
		ipcMain.on("window:maximized-change-subscribe", () => {
			if (this.mainWindow) {
				const sendMaximizeState = () => {
					this.mainWindow?.webContents.send(
						"window:maximized-change",
						this.mainWindow.isMaximized(),
					)
				}

				this.mainWindow.on("maximize", sendMaximizeState)
				this.mainWindow.on("unmaximize", sendMaximizeState)
			}
		})
	}

	/**
	 * Create the main application window
	 */
	public async createWindow(): Promise<BrowserWindow> {
		if (this.mainWindow) {
			return this.mainWindow
		}

		// Wait for tray to be ready before creating window
		try {
			// Make sure tray is initialized before hiding window
			await trayService.whenReady()
			logger.info("Tray is ready, proceeding with window creation")
		} catch (error) {
			logger.error(`Error waiting for tray: ${error}`)
			// Continue anyway, as we don't want to block window creation
		}

		// Set Content Security Policy to allow data URLs and unsafe-eval for React in development
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

		// Set vibrancy effect for macOS
		const vibrancy = process.platform === "darwin" ? "under-window" : undefined
		const backgroundColor =
			process.platform === "darwin"
				? undefined // Transparent for vibrancy
				: "#1a1b1e" // Discord dark theme background

		this.mainWindow = new BrowserWindow({
			width: 900,
			height: 680,
			minWidth: 750,
			minHeight: 600,
			show: false, // Always create hidden first, then decide when to show
			autoHideMenuBar: true,
			backgroundColor,
			vibrancy,
			titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
			trafficLightPosition: { x: 10, y: 10 },
			frame: false,
			roundedCorners: true,
			transparent: process.platform === "darwin",
			center: true,
			...(process.platform === "linux" ? { icon } : {}),
			webPreferences: {
				preload: join(__dirname, "../preload/index.js"),
				sandbox: false,
				contextIsolation: true,
				nodeIntegration: false,
			},
		})

		// Listen for maximize/unmaximize events
		this.mainWindow.on("maximize", () => {
			this.mainWindow?.webContents.send("window:maximized-change", true)
		})

		this.mainWindow.on("unmaximize", () => {
			this.mainWindow?.webContents.send("window:maximized-change", false)
		})

		this.mainWindow.on("ready-to-show", async () => {
			// Check if we should start minimized to tray
			const isFirstRun = configService.get<boolean>("isFirstRun")
			const minimizeToTray = configService.get<boolean>("minimizeToTray")
			const startWithSystem = configService.get<boolean>("startWithSystem")

			// Determine if this is a system startup launch
			const launchedAtStartup = this.wasLaunchedAtStartup()

			// Only start minimized if:
			// 1. It's not the first run (app is already configured)
			// 2. Both minimizeToTray and startWithSystem are enabled
			// 3. The app was launched during system startup
			const shouldStartMinimized =
				!isFirstRun && minimizeToTray && startWithSystem && launchedAtStartup

			if (shouldStartMinimized) {
				logger.info("Starting minimized to system tray (launched at system startup)")
				// Don't show the window, it will remain hidden and available in the tray
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
			const minimizeToTray = configService.get<boolean>("minimizeToTray")
			if (minimizeToTray) {
				event.preventDefault()
				this.mainWindow?.hide()
			}
		})

		// Handle close to tray behavior
		this.mainWindow.on("close", (event) => {
			if (!app.isQuitting) {
				const minimizeToTray = configService.get<boolean>("minimizeToTray")
				if (minimizeToTray) {
					event.preventDefault()
					this.mainWindow?.hide()
					return
				}
			}
		})

		// Check Discord connection when window regains focus
		this.mainWindow.on("focus", () => {
			if (!discordRpcService.isConnected()) {
				logger.info("Window focused, trying to reconnect to Discord")
				discordRpcService.connect().catch((error) => {
					logger.error(`Failed to reconnect to Discord on window focus: ${error}`)
				})
			}
		})

		// Check Discord connection when window is shown (e.g., from tray)
		this.mainWindow.on("show", () => {
			if (!discordRpcService.isConnected()) {
				logger.info("Window shown, trying to reconnect to Discord")
				discordRpcService.connect().catch((error) => {
					logger.error(`Failed to reconnect to Discord when showing window: ${error}`)
				})
			}
		})

		// Load the app
		if (is.dev && process.env.ELECTRON_RENDERER_URL) {
			this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
		} else {
			this.mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
		}

		logger.info("Main window created")
		return this.mainWindow
	}

	/**
	 * Check if the app was launched during system startup
	 */
	private wasLaunchedAtStartup(): boolean {
		// Different ways to detect if app was launched on startup

		// Check if app has the launch info from main.ts
		if (
			Object.prototype.hasOwnProperty.call(app, "wasLaunchedAtStartup") &&
			app.wasLaunchedAtStartup
		) {
			return true
		}

		// Check command line arguments
		const launchArgs = process.argv.slice(1).join(" ").toLowerCase()
		if (
			launchArgs.includes("--autostart") ||
			launchArgs.includes("--startup") ||
			launchArgs.includes("--launch-at-login") ||
			launchArgs.includes("--autorun")
		) {
			return true
		}

		// Check process name and path for login item indicators
		if (process.platform === "win32") {
			// Windows often launches startup apps with explorer.exe as parent
			const execPath = process.execPath.toLowerCase()
			if (execPath.includes("\\appdata\\") && !is.dev) {
				// Don't consider dev mode as startup
				return true
			}
		}

		// Check specific environment variables for macOS
		if (process.platform === "darwin") {
			// macOS sets this for login items
			if (
				process.env.LAUNCHED_BY_LAUNCHD ||
				process.env.LAUNCHED_AT_LOGIN ||
				process.env.LAUNCH_AT_LOGIN
			) {
				return true
			}
		}

		return false
	}

	/**
	 * Show the main window if exists, create it otherwise
	 */
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

	/**
	 * Close the main window
	 */
	public closeWindow(): void {
		if (this.mainWindow) {
			this.mainWindow.close()
			this.mainWindow = null
		}
	}
}

export const windowService = WindowService.getInstance()
