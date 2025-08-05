import { existsSync } from "node:fs"
import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { IpcChannels } from "@shared/types"
import { type BrowserWindow, app, dialog, shell } from "electron"
import { type UpdateInfo, autoUpdater } from "electron-updater"
import { logger } from "./logger"

/**
 * Service for automatic application updates
 */
export class AutoUpdaterService {
	private static instance: AutoUpdaterService | null = null
	private mainWindow: BrowserWindow | null = null
	private isPortable = false
	private updateCheckInProgress = false
	private retryCount = 0
	private maxRetries = 3
	private retryDelay = 5000 // 5 seconds

	private constructor() {
		this.detectPortableMode()
		this.configureUpdater()
		this.registerAutoUpdateEvents()

		logger.info("Auto updater service initialized", {
			isPortable: this.isPortable,
			isDev: is.dev,
			platform: process.platform,
			version: app.getVersion(),
		})
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
		logger.info("Main window set for auto updater notifications")
	}

	/**
	 * Detect if running in portable mode
	 */
	private detectPortableMode(): void {
		try {
			// Check if running from a portable directory structure
			const appPath = app.getAppPath()
			const execPath = process.execPath

			// Portable apps typically don't install to Program Files
			const isProgramFiles = execPath.toLowerCase().includes("program files")

			// Check for portable indicators
			const portableIndicators = ["portable", "temp", "downloads", "desktop"]

			const hasPortableIndicator = portableIndicators.some(
				(indicator) =>
					execPath.toLowerCase().includes(indicator) || appPath.toLowerCase().includes(indicator),
			)

			// Check if uninstaller exists (indicates installed version)
			const uninstallerPath = join(process.resourcesPath, "..", "Uninstall VLC Discord RP.exe")
			const hasUninstaller = existsSync(uninstallerPath)

			// Portable if: not in Program Files AND (has portable indicator OR no uninstaller)
			this.isPortable = !isProgramFiles && (hasPortableIndicator || !hasUninstaller)

			logger.info("Portable mode detection", {
				appPath,
				execPath,
				isProgramFiles,
				hasPortableIndicator,
				hasUninstaller,
				isPortable: this.isPortable,
			})
		} catch (error) {
			logger.error("Error detecting portable mode:", error)
			this.isPortable = false
		}
	}

	/**
	 * Configure auto updater based on installation type
	 */
	private configureUpdater(): void {
		autoUpdater.logger = logger
		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = !this.isPortable // Only auto-install for setup versions

		// Configure update channel and behavior
		if (is.dev) {
			autoUpdater.updateConfigPath = join(process.cwd(), "dev-app-update.yml")
			autoUpdater.forceDevUpdateConfig = true
		}

		// For portable versions, we need manual update handling
		if (this.isPortable) {
			logger.info("Portable mode: Manual update handling enabled")
		} else {
			logger.info("Setup mode: Automatic update handling enabled")
		}
	}

	/**
	 * Register auto-updater event handlers
	 */
	private registerAutoUpdateEvents(): void {
		autoUpdater.on("checking-for-update", () => {
			logger.info("Checking for updates...")
			this.updateCheckInProgress = true
			this.sendStatusToWindow("checking-for-update")
		})

		autoUpdater.on("update-available", (info) => {
			logger.info("Update available:", {
				version: info.version,
				releaseDate: info.releaseDate,
				isPortable: this.isPortable,
			})
			this.updateCheckInProgress = false
			this.retryCount = 0 // Reset retry count on success
			this.sendStatusToWindow("update-available", info)

			// Show update notification based on installation type
			this.showUpdateAvailableDialog(info)
		})

		autoUpdater.on("update-not-available", () => {
			logger.info("No updates available")
			this.updateCheckInProgress = false
			this.retryCount = 0 // Reset retry count
			this.sendStatusToWindow("update-not-available")
		})

		autoUpdater.on("download-progress", (progress) => {
			logger.info(`Download progress: ${Math.round(progress.percent)}%`, {
				bytesPerSecond: progress.bytesPerSecond,
				percent: progress.percent,
				transferred: progress.transferred,
				total: progress.total,
			})
			this.sendStatusToWindow("download-progress", progress)
		})

		autoUpdater.on("update-downloaded", (info) => {
			logger.info("Update downloaded", {
				version: info.version,
				isPortable: this.isPortable,
			})
			this.sendStatusToWindow("update-downloaded", info)

			// Handle installation based on type
			this.showUpdateDownloadedDialog(info)
		})

		autoUpdater.on("error", (err) => {
			logger.error("Auto updater error:", err)
			this.updateCheckInProgress = false
			this.sendStatusToWindow("error", err)

			// Implement retry logic
			this.handleUpdateError(err)
		})
	}

	/**
	 * Show update available dialog with portable-specific messaging
	 */
	private showUpdateAvailableDialog(info: UpdateInfo): void {
		if (!this.mainWindow) return

		const message = this.isPortable
			? `Version ${info.version} is available. Since you're using the portable version, you'll need to download and replace the current files manually. Would you like to download it now?`
			: `Version ${info.version} is available. Would you like to download it now?`

		const detail = this.isPortable
			? "For portable versions, the update will be downloaded to the app cache folder and require manual installation."
			: "The update will be installed automatically after download."

		dialog
			.showMessageBox(this.mainWindow, {
				type: "info",
				title: "Update Available",
				message,
				detail,
				buttons: ["Download", "Later"],
				defaultId: 0,
			})
			.then(({ response }) => {
				if (response === 0) {
					autoUpdater.downloadUpdate().catch((error) => {
						logger.error("Error initiating download:", error)
					})
				}
			})
			.catch((error) => {
				logger.error("Error showing update dialog:", error)
			})
	}

	/**
	 * Show update downloaded dialog with installation instructions
	 */
	private showUpdateDownloadedDialog(info: UpdateInfo): void {
		if (!this.mainWindow) return

		if (this.isPortable) {
			// For portable versions, provide manual installation instructions
			const updateCachePath = join(app.getPath("userData"), "pending")

			dialog
				.showMessageBox(this.mainWindow, {
					type: "info",
					title: "Update Downloaded",
					message: `Version ${info.version} has been downloaded successfully.`,
					detail: `Since you're using the portable version, please:\n1. Close this application\n2. Extract and replace the current files with the downloaded update\n3. Restart the application\n\nThe update file is located in the app cache folder.\nWould you like to open the folder containing the update?`,
					buttons: ["Open Update Folder", "Close"],
					defaultId: 0,
				})
				.then(({ response }) => {
					if (response === 0) {
						// Open the update cache folder where the file actually is
						shell.openPath(updateCachePath).catch((error: Error) => {
							logger.error("Error opening update cache folder:", error)
							// Fallback: try to open the user data folder
							shell.openPath(app.getPath("userData")).catch((fallbackError: Error) => {
								logger.error("Error opening user data folder:", fallbackError)
							})
						})
					}
				})
				.catch((error) => {
					logger.error("Error showing portable update dialog:", error)
				})
		} else {
			// For installed versions, offer automatic installation
			dialog
				.showMessageBox(this.mainWindow, {
					type: "info",
					title: "Update Ready",
					message: `Version ${info.version} has been downloaded and is ready to install.`,
					detail: "Would you like to install it now? The application will restart automatically.",
					buttons: ["Install and Restart", "Later"],
					defaultId: 0,
				})
				.then(({ response }) => {
					if (response === 0) {
						setImmediate(() => {
							autoUpdater.quitAndInstall(true, true)
						})
					}
				})
				.catch((error) => {
					logger.error("Error showing update dialog:", error)
				})
		}
	}

	/**
	 * Handle update errors with retry logic
	 */
	private handleUpdateError(error: Error): void {
		if (this.retryCount < this.maxRetries) {
			this.retryCount++
			logger.warn(
				`Update check failed, retrying in ${this.retryDelay}ms (attempt ${this.retryCount}/${this.maxRetries})`,
				error,
			)

			setTimeout(() => {
				this.checkForUpdates(true).catch((retryError) => {
					logger.error("Retry failed:", retryError)
				})
			}, this.retryDelay)
		} else {
			logger.error("Max retry attempts reached, giving up on update check", error)
			this.retryCount = 0
		}
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
	 * Check for updates with improved error handling
	 * @param silent If true, won't show dialog on update-not-available
	 */
	public async checkForUpdates(silent = true): Promise<void> {
		if (is.dev && !process.env.FORCE_UPDATE_CHECK) {
			logger.info("Skip update check in development mode (set FORCE_UPDATE_CHECK=1 to override)")
			return
		}

		if (this.updateCheckInProgress) {
			logger.info("Update check already in progress, skipping")
			return
		}

		try {
			logger.info("Checking for updates...", {
				currentVersion: app.getVersion(),
				isPortable: this.isPortable,
				silent,
				retryCount: this.retryCount,
			})

			this.updateCheckInProgress = true
			const result = await autoUpdater.checkForUpdates()

			if (result) {
				logger.info("Update check completed successfully", {
					updateInfo: result.updateInfo,
					downloadPromise: !!result.downloadPromise,
				})
			}
		} catch (error) {
			logger.error("Error checking for updates:", error)
			this.updateCheckInProgress = false

			if (!silent && this.mainWindow) {
				dialog
					.showMessageBox(this.mainWindow, {
						type: "error",
						title: "Update Error",
						message: `Failed to check for updates: ${error instanceof Error ? error.message : String(error)}`,
						detail: "Please check your internet connection and try again.",
					})
					.catch((dialogError) => {
						logger.error("Error showing update error dialog:", dialogError)
					})
			}

			// Don't trigger retry logic here, it's handled in the error event
		}
	}

	/**
	 * Download available update
	 */
	public downloadUpdate(): void {
		logger.info("Manually triggering update download")
		autoUpdater.downloadUpdate().catch((error) => {
			logger.error("Error downloading update:", error)
		})
	}

	/**
	 * Get current installation type
	 */
	public getInstallationType(): "portable" | "setup" {
		return this.isPortable ? "portable" : "setup"
	}

	/**
	 * Force check for updates (ignores dev mode)
	 */
	public async forceCheckForUpdates(): Promise<void> {
		const originalEnv = process.env.FORCE_UPDATE_CHECK
		process.env.FORCE_UPDATE_CHECK = "1"

		try {
			await this.checkForUpdates(false)
		} finally {
			if (originalEnv === undefined) {
				process.env.FORCE_UPDATE_CHECK = undefined
			} else {
				process.env.FORCE_UPDATE_CHECK = originalEnv
			}
		}
	}

	/**
	 * Get update status information
	 */
	public getUpdateStatus(): {
		isPortable: boolean
		updateCheckInProgress: boolean
		retryCount: number
		currentVersion: string
	} {
		return {
			isPortable: this.isPortable,
			updateCheckInProgress: this.updateCheckInProgress,
			retryCount: this.retryCount,
			currentVersion: app.getVersion(),
		}
	}

	/**
	 * Open the update cache folder in the file explorer
	 */
	public async openCacheFolder(): Promise<void> {
		const updateCachePath = join(app.getPath("userData"), "pending")

		try {
			await shell.openPath(updateCachePath)
			logger.info("Opened update cache folder:", updateCachePath)
		} catch (error) {
			logger.error("Error opening update cache folder:", error)
			// Fallback: try to open the user data folder
			try {
				await shell.openPath(app.getPath("userData"))
				logger.info("Opened user data folder as fallback")
			} catch (fallbackError) {
				logger.error("Error opening user data folder:", fallbackError)
				throw fallbackError
			}
		}
	}
}

export const autoUpdaterService = AutoUpdaterService.getInstance()
