import { existsSync } from "node:fs"
import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import type { Clock } from "@main/core/clock"
import { logger } from "@main/core/logger"
import type { IpcEvent } from "@shared/ipc"
import { type BrowserWindow, app, dialog, shell } from "electron"
import { type UpdateInfo, autoUpdater } from "electron-updater"
import { type InstallKind, detectInstallKind, probeInstall } from "./updates.install-kind"
import { createUpdaterLogger, describeError, redactUrls } from "./updates.log"

/**
 * The app lives in the tray and starts with Windows, so an install can run for
 * weeks without a restart. One check at startup would mean never hearing about
 * a release. Six hours is four requests a day for a few hundred bytes of
 * metadata, and the window opening covers the case of someone actually present.
 */
const FIRST_CHECK_DELAY_MS = 3_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const OPEN_WINDOW_GAP_MS = 30 * 60 * 1000

/** Three attempts spread over twenty minutes, then wait for the next cadence. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]

const RELEASES_URL = "https://github.com/valentin-marquez/vlc-rpc/releases/latest"

/**
 * What the updater is busy with. A check that overlaps another wastes a
 * request, and a failure means something different during a download than it
 * does during a check.
 */
type Phase = { kind: "idle" } | { kind: "checking" } | { kind: "downloading" }

/**
 * Service for automatic application updates
 */
export class Updater {
	private mainWindow: BrowserWindow | null = null
	private readonly install: InstallKind
	private phase: Phase = { kind: "idle" }
	private firstCheckTimer: NodeJS.Timeout | null = null
	private periodicTimer: NodeJS.Timeout | null = null
	private retryTimer: NodeJS.Timeout | null = null
	private retryAttempt = 0
	private lastCheckAt = 0
	private announced: { version: string; dialogShown: boolean } | null = null
	private lastLoggedPercent = -1

	constructor(private readonly clock: Clock) {
		this.install = detectInstallKind(probeInstall(process.env, process.resourcesPath, existsSync))
		this.configureUpdater()
		this.registerAutoUpdateEvents()

		logger.info("Auto updater service initialized", {
			installedAs: this.install.kind,
			reason: this.install.kind === "portable" ? this.install.reason : "uninstaller-present",
			isDev: is.dev,
			platform: process.platform,
			version: app.getVersion(),
		})
	}

	/**
	 * Set the main window for notifications
	 */
	public setMainWindow(window: BrowserWindow): void {
		this.mainWindow = window

		window.on("show", () => {
			this.checkOnOpenedWindow()
		})

		logger.info("Main window set for auto updater notifications")
	}

	/**
	 * Begin the periodic checks. Idempotent, so a second call is a no-op.
	 */
	public start(): void {
		if (this.periodicTimer !== null) return

		// The first scheduled check stands in for one just made, so opening the
		// window during startup does not add a second request.
		this.lastCheckAt = this.clock.now()

		this.firstCheckTimer = setTimeout(() => {
			this.firstCheckTimer = null
			void this.checkForUpdates(true)
		}, FIRST_CHECK_DELAY_MS)

		this.periodicTimer = setInterval(() => {
			void this.checkForUpdates(true)
		}, CHECK_INTERVAL_MS)

		logger.info("Update checks scheduled", {
			firstCheckInSeconds: FIRST_CHECK_DELAY_MS / 1000,
			everyHours: CHECK_INTERVAL_MS / (60 * 60 * 1000),
		})
	}

	public stop(): void {
		if (this.firstCheckTimer !== null) {
			clearTimeout(this.firstCheckTimer)
			this.firstCheckTimer = null
		}
		if (this.periodicTimer !== null) {
			clearInterval(this.periodicTimer)
			this.periodicTimer = null
		}
		this.clearRetry()
	}

	private configureUpdater(): void {
		// electron-updater logs the release url, the download url and the local
		// install path at info level, so it writes through a redacting shim.
		autoUpdater.logger = createUpdaterLogger(logger)
		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = this.install.kind === "installed"

		if (is.dev) {
			autoUpdater.updateConfigPath = join(process.cwd(), "dev-app-update.yml")
			autoUpdater.forceDevUpdateConfig = true
		}
	}

	private registerAutoUpdateEvents(): void {
		autoUpdater.on("checking-for-update", () => {
			this.sendStatusToWindow("checking-for-update")
		})

		autoUpdater.on("update-available", (info) => {
			logger.info("Update available", {
				version: info.version,
				installedAs: this.install.kind,
			})
			this.onCheckSucceeded()
			this.announce(info)
		})

		autoUpdater.on("update-not-available", () => {
			logger.info("No updates available")
			this.onCheckSucceeded()
			this.sendStatusToWindow("update-not-available")
		})

		autoUpdater.on("download-progress", (progress) => {
			const percent = Math.round(progress.percent)
			if (percent !== this.lastLoggedPercent) {
				this.lastLoggedPercent = percent
				logger.info(`Download progress: ${percent}%`)
			}
			this.sendStatusToWindow("download-progress", progress)
		})

		autoUpdater.on("update-downloaded", (info) => {
			logger.info("Update downloaded", {
				version: info.version,
				installedAs: this.install.kind,
			})
			this.phase = { kind: "idle" }
			this.lastLoggedPercent = -1
			this.sendStatusToWindow("update-downloaded", info)
			this.showUpdateDownloadedDialog(info)
		})

		autoUpdater.on("error", (error) => {
			const during = this.phase.kind
			logger.error("Auto updater error", { during, ...describeError(error) })

			this.phase = { kind: "idle" }
			this.sendStatusToWindow("error", this.toErrorPayload(error))

			// A failed download is not a reason to ask GitHub for the feed again.
			if (during === "checking") {
				this.scheduleRetry()
			}
		})
	}

	/**
	 * A person at the keyboard is the best moment to check, but opening and
	 * closing the window a few times in a row must not turn into requests.
	 */
	private checkOnOpenedWindow(): void {
		if (this.clock.now() - this.lastCheckAt < OPEN_WINDOW_GAP_MS) return

		void this.checkForUpdates(true)
	}

	/**
	 * The same version is found again on every check until the user updates, so
	 * the announcement is made once, and the modal waits for a visible window
	 * rather than interrupting whatever is on screen.
	 */
	private announce(info: UpdateInfo): void {
		if (this.announced?.version !== info.version) {
			this.announced = { version: info.version, dialogShown: false }
			this.sendStatusToWindow("update-available", info)
		}

		const announced = this.announced
		if (announced === null || announced.dialogShown) return

		const window = this.liveWindow()
		if (window === null || !window.isVisible()) {
			logger.info("Holding the update dialog until the window is open", { version: info.version })
			return
		}

		this.announced = { version: announced.version, dialogShown: true }
		this.showUpdateAvailableDialog(info)
	}

	private showUpdateAvailableDialog(info: UpdateInfo): void {
		const window = this.liveWindow()
		if (window === null) return

		const portable = this.install.kind === "portable"

		dialog
			.showMessageBox(window, {
				type: "info",
				title: "Update Available",
				message: `Version ${info.version} is available.`,
				detail: portable
					? "This is the portable build. The release page has the new portable executable: download it and replace this one."
					: "The update downloads in the background and installs when you choose.",
				buttons: portable ? ["Open Release Page", "Later"] : ["Download", "Later"],
				defaultId: 0,
				cancelId: 1,
			})
			.then(({ response }) => {
				if (response !== 0) return

				if (portable) {
					void this.openReleasePage()
					return
				}

				this.downloadUpdate()
			})
			.catch((error) => {
				logger.error("Error showing update dialog", describeError(error))
			})
	}

	private showUpdateDownloadedDialog(info: UpdateInfo): void {
		const window = this.liveWindow()
		if (window === null) return

		// Only an installed copy ever gets here: a portable one is never asked to
		// download, because the feed carries the installer and nothing else.
		if (this.install.kind === "portable") {
			void this.openReleasePage()
			return
		}

		dialog
			.showMessageBox(window, {
				type: "info",
				title: "Update Ready",
				message: `Version ${info.version} has been downloaded and is ready to install.`,
				detail: "Would you like to install it now? The application will restart automatically.",
				buttons: ["Install and Restart", "Later"],
				defaultId: 0,
				cancelId: 1,
			})
			.then(({ response }) => {
				if (response === 0) {
					this.installNow()
				}
			})
			.catch((error) => {
				logger.error("Error showing update dialog", describeError(error))
			})
	}

	private scheduleRetry(): void {
		if (this.retryTimer !== null) return

		const delay = RETRY_DELAYS_MS[this.retryAttempt]
		if (delay === undefined) {
			logger.warn("Update check keeps failing, waiting for the next scheduled check", {
				attempts: this.retryAttempt,
			})
			this.retryAttempt = 0
			return
		}

		this.retryAttempt += 1
		logger.info("Update check failed, retrying later", {
			attempt: this.retryAttempt,
			inSeconds: delay / 1000,
		})

		this.retryTimer = setTimeout(() => {
			this.retryTimer = null
			void this.checkForUpdates(true)
		}, delay)
	}

	private onCheckSucceeded(): void {
		this.retryAttempt = 0
		this.clearRetry()
	}

	private clearRetry(): void {
		if (this.retryTimer === null) return

		clearTimeout(this.retryTimer)
		this.retryTimer = null
	}

	private toErrorPayload(error: unknown): { name: string; code?: string; message: string } {
		return {
			...describeError(error),
			message: error instanceof Error ? redactUrls(error.message) : "Unknown error",
		}
	}

	/** These events now fire for as long as the app runs, so a window that went away must not throw. */
	private liveWindow(): BrowserWindow | null {
		const window = this.mainWindow
		return window === null || window.isDestroyed() ? null : window
	}

	private sendStatusToWindow(status: string, data?: unknown): void {
		const window = this.liveWindow()
		if (window === null) return

		const channel = `update:${status}` as IpcEvent
		window.webContents.send(channel, data)
	}

	/**
	 * @param silent If true, won't show a dialog when the check itself fails
	 */
	public async checkForUpdates(silent = true): Promise<void> {
		return this.runCheck(silent, false)
	}

	private async runCheck(silent: boolean, force: boolean): Promise<void> {
		if (is.dev && !force && !process.env.FORCE_UPDATE_CHECK) {
			logger.info("Skip update check in development mode (set FORCE_UPDATE_CHECK=1 to override)")
			return
		}

		if (this.phase.kind !== "idle") {
			logger.info("Updater is busy, skipping this check", { phase: this.phase.kind })
			return
		}

		this.phase = { kind: "checking" }
		this.lastCheckAt = this.clock.now()

		logger.info("Checking for updates", {
			currentVersion: app.getVersion(),
			installedAs: this.install.kind,
			silent,
			retryAttempt: this.retryAttempt,
		})

		try {
			await autoUpdater.checkForUpdates()
		} catch (error) {
			logger.error("Error checking for updates", describeError(error))

			const window = this.liveWindow()
			if (!silent && window !== null) {
				dialog
					.showMessageBox(window, {
						type: "error",
						title: "Update Error",
						message: "Failed to check for updates.",
						detail: "Please check your internet connection and try again.",
					})
					.catch((dialogError) => {
						logger.error("Error showing update error dialog", describeError(dialogError))
					})
			}
		} finally {
			// A download started from the dialog while this was in flight keeps
			// the phase it set.
			if (this.phase.kind === "checking") {
				this.phase = { kind: "idle" }
			}
		}
	}

	/**
	 * Download available update
	 */
	public downloadUpdate(): void {
		if (this.install.kind === "portable") {
			// The update feed lists the installer, so what would land in the cache
			// is not the portable executable this copy is made of.
			logger.info("Portable copy asked for a download, opening the release page instead")
			void this.openReleasePage()
			return
		}

		logger.info("Downloading update")
		this.phase = { kind: "downloading" }

		autoUpdater.downloadUpdate().catch((error) => {
			this.phase = { kind: "idle" }
			logger.error("Error downloading update", describeError(error))
		})
	}

	/**
	 * Install a downloaded update and restart. Only an installed copy can do
	 * this: a portable one is sent to the release page instead.
	 */
	public installNow(): void {
		if (this.install.kind === "portable") {
			void this.openReleasePage()
			return
		}

		logger.info("Installing update and restarting")
		setImmediate(() => {
			autoUpdater.quitAndInstall(true, true)
		})
	}

	public async openReleasePage(): Promise<void> {
		try {
			await shell.openExternal(RELEASES_URL)
			logger.info("Opened the release page")
		} catch (error) {
			logger.error("Error opening the release page", describeError(error))
		}
	}

	/**
	 * Get current installation type
	 */
	public getInstallationType(): "portable" | "setup" {
		return this.install.kind === "portable" ? "portable" : "setup"
	}

	/**
	 * Force check for updates (ignores dev mode)
	 */
	public async forceCheckForUpdates(): Promise<void> {
		return this.runCheck(false, true)
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
			isPortable: this.install.kind === "portable",
			updateCheckInProgress: this.phase.kind === "checking",
			retryCount: this.retryAttempt,
			currentVersion: app.getVersion(),
		}
	}
}
