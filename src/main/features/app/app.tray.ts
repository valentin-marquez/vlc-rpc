import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Client as DiscordClient } from "@main/features/discord"
import {
	Tray as ElectronTray,
	Menu,
	type MenuItemConstructorOptions,
	app,
	nativeImage,
	powerMonitor,
} from "electron"
import iconPath16 from "../../../../resources/icons/16x16.png?asset"
import type { Startup } from "./app.startup"
import type { Window } from "./app.window"

/**
 * System tray service
 */
const TEMPORARY_DISABLES = [
	{ label: "Disable for 15 minutes", minutes: 15 },
	{ label: "Disable for 1 hour", minutes: 60 },
	{ label: "Disable for 2 hours", minutes: 120 },
] as const

// Built once, at import. `toLocaleTimeString` builds a formatter per call, and
// the first one built in a process is what pays for the platform's locale data:
// on Windows that is the host time zone lookup, tens of milliseconds when the
// machine is idle and unbounded when it is not. This menu is rebuilt every ten
// seconds for as long as a temporary window runs, so the cost belongs at
// startup rather than inside the first menu that happens to name a time.
const UNTIL_TIME = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
})

export class Tray {
	private tray: ElectronTray | null = null
	private window: Window | null = null
	private readyPromise: Promise<void>
	private readyResolver: (() => void) | null = null
	private menuUpdateTimer: NodeJS.Timeout | null = null
	private keepaliveTimer: NodeJS.Timeout | null = null

	constructor(
		private readonly startup: Startup,
		private readonly discord: DiscordClient,
	) {
		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolver = resolve
		})

		if (app.isReady()) {
			this.initTray()
		} else {
			app.whenReady().then(() => this.initTray())
		}

		app.on("before-quit", () => this.dispose())

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
	 * Wire the window reference after both this and the window exist. Tray and
	 * Window depend on each other only inside callbacks that fire well after
	 * construction, so neither needs the other to be born; this is the one
	 * connection the composition root makes explicit instead of leaving it
	 * hidden behind two modules importing each other.
	 */
	public setWindow(window: Window): void {
		this.window = window
	}

	/**
	 * Stop everything this tray started. The keepalive watches for an icon that
	 * went missing and builds a new one, so leaving it running past the quit is
	 * how a tray icon comes back a minute after the user asked for it to go.
	 */
	public dispose(): void {
		this.stopTrayKeepalive()
		this.stopMenuUpdateTimer()

		if (this.tray) {
			this.tray.destroy()
			this.tray = null
			logger.info("Tray destroyed")
		}
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

			this.tray = new ElectronTray(trayIcon)
			this.tray.setIgnoreDoubleClickEvents(true)
			this.tray.setToolTip("VLC Discord RP")
			this.updateContextMenu()

			this.tray.on("click", () => {
				this.window?.showWindow()
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
			this.tray = new ElectronTray(nativeImg)

			this.tray.setToolTip("VLC Discord RP")
			this.updateContextMenu()

			this.tray.on("click", () => {
				this.window?.showWindow()
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
		this.stopTrayKeepalive()

		this.keepaliveTimer = setInterval(() => {
			if (!this.tray || this.tray.isDestroyed()) {
				logger.info("Tray keepalive check - tray missing or destroyed, reinitializing")
				this.initTray()
			}
		}, 60000)
	}

	/**
	 * Stop the periodic tray check
	 */
	private stopTrayKeepalive(): void {
		if (this.keepaliveTimer) {
			clearInterval(this.keepaliveTimer)
			this.keepaliveTimer = null
			logger.info("Tray keepalive stopped")
		}
	}

	/**
	 * Start the timer to update the menu periodically
	 */
	private startMenuUpdateTimer(): void {
		this.stopMenuUpdateTimer()

		this.menuUpdateTimer = setInterval(() => {
			// A pending temporary window is the only thing that changes the menu
			// on its own. Once it elapses the client drops the timestamp, the
			// refreshed menu reads as enabled again and this goes quiet.
			if (configService.get("rpcDisabledUntil") !== undefined) {
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
			const config = configService.get()

			const menuItems: MenuItemConstructorOptions[] = [
				{
					label: "Open VLC Discord RP",
					click: () => this.window?.showWindow(),
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
			if (!this.startup.isPortable()) {
				menuItems.push({
					label: "Start with System",
					type: "checkbox",
					checked: config.startWithSystem,
					click: () => {
						const newValue = !config.startWithSystem
						configService.set("startWithSystem", newValue)
						this.startup.setStartAtLogin(newValue)
					},
				})
			}

			const rpcEnabled = this.discord.isRpcEnabled()

			menuItems.push(
				{ type: "separator" },
				{
					label: this.rpcMenuLabel(rpcEnabled),
					type: "checkbox",
					checked: rpcEnabled,
					click: () => {
						if (rpcEnabled) {
							this.discord.disableRpc()
						} else {
							this.discord.enableRpc()
						}
						this.updateContextMenu()
					},
				},
				// The three the README has always promised. Issue 30 is someone
				// reading that page, looking for them here and finding one.
				...TEMPORARY_DISABLES.map(({ label, minutes }) => ({
					label,
					enabled: rpcEnabled,
					click: () => {
						this.discord.disableRpcTemporary(minutes)
						this.updateContextMenu()
					},
				})),
			)

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

	/**
	 * Takes the on/off answer from the client instead of reading the flags a
	 * second time, so the menu cannot claim one thing while Discord shows
	 * another. Only the wording is decided here.
	 */
	private rpcMenuLabel(enabled: boolean): string {
		if (enabled) {
			return "Rich Presence"
		}

		const disabledUntil = configService.get("rpcDisabledUntil")
		if (disabledUntil === undefined) {
			return "Rich Presence (off)"
		}

		return `Rich Presence (off until ${UNTIL_TIME.format(disabledUntil)})`
	}
}
