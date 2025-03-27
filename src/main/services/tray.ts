import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { Menu, Tray, app, nativeImage } from "electron"
import iconPath16 from "../../../resources/icons/16x16.png?asset"
import iconPath32 from "../../../resources/icons/32x32.png?asset"
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
		})

		this.setupTrayKeepalive()
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
	 * Initialize the tray icon and menu
	 */
	private initTray(): void {
		try {
			logger.info("Initializing tray")

			const iconPath = this.getTrayIconPath()
			logger.info(`Loading tray icon from: ${iconPath}`)

			const trayIcon = nativeImage.createFromPath(iconPath)

			if (trayIcon.isEmpty()) {
				logger.error("Tray icon is empty, will try fallback")
				throw new Error("Empty tray icon")
			}

			if (this.tray) {
				this.tray.destroy()
			}

			this.tray = new Tray(trayIcon)

			if (process.platform === "win32") {
				this.tray.setIgnoreDoubleClickEvents(true)
			}

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
	 * Get the appropriate icon path for the current platform
	 */
	private getTrayIconPath(): string {
		const iconSize = process.platform === "darwin" ? "32x32" : "16x16"
		const iconName = `${iconSize}.png`

		if (is.dev) {
			return process.platform === "darwin" ? iconPath32 : iconPath16
		}
		return join(process.resourcesPath, "resources", "icons", iconName)
	}

	/**
	 * Fallback method to initialize tray with a simpler approach
	 */
	private fallbackTrayInit(): void {
		try {
			logger.info("Attempting fallback tray initialization")

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
			if (
				!this.tray ||
				(process.platform === "win32" && !this.tray.isDestroyed() && !app.isQuitting)
			) {
				logger.info("Tray keepalive check - tray missing, reinitializing")
				this.initTray()
			}
		}, 30000)
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
			const config = configService.get<{ minimizeToTray: boolean; startWithSystem: boolean }>()

			const contextMenu = Menu.buildFromTemplate([
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
				{
					label: "Start with System",
					type: "checkbox",
					checked: config.startWithSystem,
					click: () => {
						const newValue = !config.startWithSystem
						configService.set("startWithSystem", newValue)
						startupService.setStartAtLogin(newValue)
					},
				},
				{ type: "separator" },
				{
					label: "Exit",
					click: () => {
						app.isQuitting = true
						app.quit()
					},
				},
			])

			this.tray.setContextMenu(contextMenu)
			logger.info("Tray context menu updated")
		} catch (error) {
			logger.error(`Failed to update tray context menu: ${error}`)
		}
	}
}

export const trayService = TrayService.getInstance()
