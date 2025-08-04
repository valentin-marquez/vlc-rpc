import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import {
	Menu,
	type MenuItemConstructorOptions,
	Tray,
	app,
	nativeImage,
	powerMonitor,
} from "electron"
import iconPath16 from "../../../resources/icons/16x16.png?asset"
import { configService } from "./config"
import { logger } from "./logger"
import { startupService } from "./startup"
import { windowService } from "./window"

/**
 * System tray service
 */
export class TrayService {
	private static instance: TrayService | null = null
	private tray: Tray | null = null
	private readyPromise: Promise<void>
	private readyResolver: (() => void) | null = null
	private menuUpdateTimer: NodeJS.Timeout | null = null

	private constructor() {
		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolver = resolve
		})

		if (app.isReady()) {
			this.initTray()
		} else {
			app.whenReady().then(() => this.initTray())
		}

		app.on("before-quit", () => {
			if (this.tray) {
				this.tray.destroy()
				this.tray = null
				logger.info("Tray destroyed during app quit")
			}
			this.stopMenuUpdateTimer()
		})

		// Handle system events that may affect the tray
		powerMonitor.on("suspend", () => {
			logger.info("System is going to sleep")
		})

		powerMonitor.on("resume", () => {
			logger.info("System resumed from sleep")
			// Verify tray icon after system resume
			setTimeout(() => {
				if (!this.tray || this.tray.isDestroyed()) {
					logger.info("Tray icon lost after system resume, reinitializing")
					this.initTray()
				}
			}, 1000)
		})

		powerMonitor.on("lock-screen", () => {
			logger.info("Screen locked")
		})

		powerMonitor.on("unlock-screen", () => {
			logger.info("Screen unlocked")
			// Verify tray icon after screen unlock
			setTimeout(() => {
				if (!this.tray || this.tray.isDestroyed()) {
					logger.info("Tray icon lost after screen unlock, reinitializing")
					this.initTray()
				}
			}, 1000)
		})

		this.setupTrayKeepalive()
		this.startMenuUpdateTimer()
	}

	/**
	 * Get the singleton instance of the tray service
	 */
	public static getInstance(): TrayService {
		if (!TrayService.instance) {
			TrayService.instance = new TrayService()
		}
		return TrayService.instance
	}

	/**
	 * Wait until the tray is ready
	 */
	public async whenReady(): Promise<void> {
		return this.readyPromise
	}

	/**
	 * Get the current state of the tray for debugging purposes
	 */
	public getTrayState(): {
		exists: boolean
		isDestroyed: boolean | null
		isReady: boolean
	} {
		return {
			exists: this.tray !== null,
			isDestroyed: this.tray ? this.tray.isDestroyed() : null,
			isReady: this.readyResolver === null,
		}
	}

	/**
	 * Initialize the tray icon and menu
	 */
	private initTray(): void {
		try {
			// Prevent multiple initializations
			if (this.tray && !this.tray.isDestroyed()) {
				logger.info("Tray already exists and is not destroyed, skipping initialization")
				return
			}

			logger.info("Initializing tray")

			const iconPath = this.getTrayIconPath()
			logger.info(`Loading tray icon from: ${iconPath}`)

			const trayIcon = nativeImage.createFromPath(iconPath)

			if (trayIcon.isEmpty()) {
				logger.error("Tray icon is empty, will try fallback")
				throw new Error("Empty tray icon")
			}

			// Destroy existing tray if it exists
			if (this.tray) {
				try {
					this.tray.destroy()
					logger.info("Destroyed existing tray before creating new one")
				} catch (error) {
					logger.warn(`Error destroying existing tray: ${error}`)
				}
			}

			this.tray = new Tray(trayIcon)
			this.tray.setIgnoreDoubleClickEvents(true)
			this.tray.setToolTip("VLC Discord Rich Presence")
			this.updateContextMenu()

			this.tray.on("click", () => {
				windowService.showWindow()
			})

			logger.info("Tray initialized successfully")

			if (this.readyResolver) {
				this.readyResolver()
				this.readyResolver = null
			}
		} catch (error) {
			logger.error(`Failed to initialize tray: ${error}`)
			this.fallbackTrayInit()
		}
	}

	/**
	 * Get the appropriate icon path
	 */
	private getTrayIconPath(): string {
		const iconName = "16x16.png"

		if (is.dev) {
			return iconPath16
		}
		return join(process.resourcesPath, "resources", "icons", iconName)
	}

	/**
	 * Fallback method to initialize tray with a simpler approach
	 */
	private fallbackTrayInit(): void {
		try {
			// Prevent multiple fallback initializations
			if (this.tray && !this.tray.isDestroyed()) {
				logger.info("Tray already exists and is not destroyed, skipping fallback initialization")
				return
			}

			logger.info("Attempting fallback tray initialization")

			// Destroy existing tray if it exists
			if (this.tray) {
				try {
					this.tray.destroy()
					logger.info("Destroyed existing tray before fallback creation")
				} catch (error) {
					logger.warn(`Error destroying existing tray in fallback: ${error}`)
				}
			}

			const svgIcon = `
				<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
					<rect width="16" height="16" fill="#5865F2" />
					<path d="M3 4L8 12L13 4" stroke="white" stroke-width="2" fill="none" />
				</svg>
			`

			const svgBuffer = Buffer.from(svgIcon)
			const nativeImg = nativeImage.createFromBuffer(svgBuffer)
			this.tray = new Tray(nativeImg)

			this.tray.setToolTip("VLC Discord Rich Presence")
			this.updateContextMenu()

			this.tray.on("click", () => {
				windowService.showWindow()
			})

			logger.info("Fallback tray initialized")

			if (this.readyResolver) {
				this.readyResolver()
				this.readyResolver = null
			}
		} catch (error) {
			logger.error(`Fallback tray initialization failed: ${error}`)
		}
	}

	/**
	 * Setup a periodic check to ensure tray icon exists
	 */
	private setupTrayKeepalive(): void {
		setInterval(() => {
			if (!this.tray || this.tray.isDestroyed()) {
				logger.info("Tray keepalive check - tray missing or destroyed, reinitializing")
				this.initTray()
			}
		}, 60000)
	}

	/**
	 * Start the timer to update the menu periodically
	 */
	private startMenuUpdateTimer(): void {
		this.stopMenuUpdateTimer()

		this.menuUpdateTimer = setInterval(() => {
			const config = configService.get<{ rpcDisabledUntil?: number }>()

			// Update menu if RPC is temporarily disabled
			if (config.rpcDisabledUntil && Date.now() < config.rpcDisabledUntil) {
				this.updateContextMenu()
			}
		}, 10000)
	}

	/**
	 * Stop the menu update timer
	 */
	private stopMenuUpdateTimer(): void {
		if (this.menuUpdateTimer) {
			clearInterval(this.menuUpdateTimer)
			this.menuUpdateTimer = null
			logger.info("Menu update timer stopped")
		}
	}

	/**
	 * Update the tray context menu based on current configuration
	 */
	public updateContextMenu(): void {
		if (!this.tray) {
			logger.warn("Cannot update tray menu, tray is not initialized")
			return
		}

		try {
			const config = configService.get<{
				minimizeToTray: boolean
				startWithSystem: boolean
			}>()

			const menuItems: MenuItemConstructorOptions[] = [
				{
					label: "Open VLC Discord RP",
					click: () => windowService.showWindow(),
				},
				{ type: "separator" },
				{
					label: "Minimize to Tray",
					type: "checkbox",
					checked: config.minimizeToTray,
					click: () => {
						const newValue = !config.minimizeToTray
						configService.set("minimizeToTray", newValue)
					},
				},
			]

			// Only show "Start with System" for non-portable versions
			if (!startupService.isPortable()) {
				menuItems.push({
					label: "Start with System",
					type: "checkbox",
					checked: config.startWithSystem,
					click: () => {
						const newValue = !config.startWithSystem
						configService.set("startWithSystem", newValue)
						startupService.setStartAtLogin(newValue)
					},
				})
			}

			menuItems.push(
				{ type: "separator" },
				{
					label: "Exit",
					click: () => {
						app.isQuitting = true
						app.quit()
					},
				},
			)

			const contextMenu = Menu.buildFromTemplate(menuItems)
			this.tray.setContextMenu(contextMenu)
			logger.info("Tray context menu updated")
		} catch (error) {
			logger.error(`Failed to update tray context menu: ${error}`)
		}
	}
}

export const trayService = TrayService.getInstance()
