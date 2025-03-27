import { is } from "@electron-toolkit/utils"
import { IpcChannels } from "@shared/types"
import { type BrowserWindow, dialog } from "electron"
import { autoUpdater } from "electron-updater"
import { logger } from "./logger"

/**
 * Service for automatic application updates
 */
export class AutoUpdaterService {
	private static instance: AutoUpdaterService | null = null
	private mainWindow: BrowserWindow | null = null

	private constructor() {
		autoUpdater.logger = logger
		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = true

		this.registerAutoUpdateEvents()

		logger.info("Auto updater service initialized")
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): AutoUpdaterService {
		if (!AutoUpdaterService.instance) {
			AutoUpdaterService.instance = new AutoUpdaterService()
		}
		return AutoUpdaterService.instance
	}

	/**
	 * Set the main window for notifications
	 */
	public setMainWindow(window: BrowserWindow): void {
		this.mainWindow = window
	}

	/**
	 * Register auto-updater event handlers
	 */
	private registerAutoUpdateEvents(): void {
		autoUpdater.on("checking-for-update", () => {
			logger.info("Checking for updates...")
			this.sendStatusToWindow("checking-for-update")
		})

		autoUpdater.on("update-available", (info) => {
			logger.info("Update available:", info)
			this.sendStatusToWindow("update-available", info)

			// Ask user if they want to update now
			if (this.mainWindow) {
				dialog
					.showMessageBox(this.mainWindow, {
						type: "info",
						title: "Update Available",
						message: `Version ${info.version} is available. Would you like to download it now?`,
						buttons: ["Download", "Later"],
						defaultId: 0,
					})
					.then(({ response }) => {
						if (response === 0) {
							autoUpdater.downloadUpdate()
						}
					})
			}
		})

		autoUpdater.on("update-not-available", () => {
			logger.info("No updates available")
			this.sendStatusToWindow("update-not-available")
		})

		autoUpdater.on("download-progress", (progress) => {
			logger.info(`Download progress: ${Math.round(progress.percent)}%`)
			this.sendStatusToWindow("download-progress", progress)
		})

		autoUpdater.on("update-downloaded", (info) => {
			logger.info("Update downloaded, will install on quit", info)
			this.sendStatusToWindow("update-downloaded", info)

			// Ask user if they want to restart and install
			if (this.mainWindow) {
				dialog
					.showMessageBox(this.mainWindow, {
						type: "info",
						title: "Update Ready",
						message: "Update has been downloaded. Would you like to install it now?",
						buttons: ["Install and Restart", "Later"],
						defaultId: 0,
					})
					.then(({ response }) => {
						if (response === 0) {
							autoUpdater.quitAndInstall(true, true)
						}
					})
			}
		})

		autoUpdater.on("error", (err) => {
			logger.error("Auto updater error:", err)
			this.sendStatusToWindow("error", err)
		})
	}

	/**
	 * Send update status to renderer process
	 */
	private sendStatusToWindow(status: string, data?: unknown): void {
		if (this.mainWindow) {
			this.mainWindow.webContents.send(`${IpcChannels.UPDATE}:${status}`, data)
		}
	}

	/**
	 * Check for updates
	 * @param silent If true, won't show dialog on update-not-available
	 */
	public async checkForUpdates(silent = true): Promise<void> {
		if (is.dev) {
			logger.info("Skip update check in development mode")
			return
		}

		try {
			logger.info("Manually checking for updates...")
			await autoUpdater.checkForUpdates()
		} catch (error) {
			logger.error("Error checking for updates:", error)

			if (!silent && this.mainWindow) {
				dialog.showMessageBox(this.mainWindow, {
					type: "error",
					title: "Update Error",
					message: `Failed to check for updates: ${error}`,
				})
			}
		}
	}

	/**
	 * Download available update
	 */
	public downloadUpdate(): void {
		autoUpdater.downloadUpdate().catch((error) => {
			logger.error("Error downloading update:", error)
		})
	}
}

export const autoUpdaterService = AutoUpdaterService.getInstance()
