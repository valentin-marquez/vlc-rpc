import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import type { Clock } from "@main/core/clock"
import { logger } from "@main/core/logger"
import type {
	UpdateAvailability,
	UpdateCheckResult,
	UpdateInstallKind,
} from "@shared/updates/update.types"
import { type BrowserWindow, app, shell } from "electron"
import { type UpdateInfo, autoUpdater } from "electron-updater"
import type { InstallKind } from "./updates.install-kind"
import { createUpdaterLogger, describeError } from "./updates.log"

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

export class Updater {
	private mainWindow: BrowserWindow | null = null
	private phase: Phase = { kind: "idle" }
	/**
	 * The announcement itself, rather than a flag saying it was made. A release
	 * is found again on every check until it is applied, and a window that opens
	 * later has to be able to ask what stands.
	 */
	private availability: UpdateAvailability = { kind: "none" }
	private firstCheckTimer: NodeJS.Timeout | null = null
	private periodicTimer: NodeJS.Timeout | null = null
	private retryTimer: NodeJS.Timeout | null = null
	private retryAttempt = 0
	private lastCheckAt = 0
	private lastLoggedPercent = -1

	constructor(
		private readonly clock: Clock,
		private readonly install: InstallKind,
	) {
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
			void this.checkForUpdates()
		}, FIRST_CHECK_DELAY_MS)

		this.periodicTimer = setInterval(() => {
			void this.checkForUpdates()
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

			// Four checks a day, and this is the answer to nearly all of them.
			// Only a release that was pulled is news.
			if (this.availability.kind !== "none") {
				this.setAvailability({ kind: "none" })
			}
		})

		autoUpdater.on("download-progress", (progress) => {
			const percent = Math.round(progress.percent)
			if (percent !== this.lastLoggedPercent) {
				this.lastLoggedPercent = percent
				logger.info(`Download progress: ${percent}%`)
			}

			const version = this.announcedVersion()
			if (version === null) return

			this.setAvailability({ kind: "downloading", version, percent })
		})

		autoUpdater.on("update-downloaded", (info) => {
			logger.info("Update downloaded", {
				version: info.version,
				installedAs: this.install.kind,
			})
			this.phase = { kind: "idle" }
			this.lastLoggedPercent = -1
			this.setAvailability({ kind: "ready", version: info.version })

			// Nothing downloads on its own: autoDownload is off and the only way
			// here is the user pressing a button that says the app restarts to
			// finish. Asking a second time would be asking them to repeat it.
			this.installNow()
		})

		autoUpdater.on("error", (error) => {
			const during = this.phase.kind
			logger.error("Auto updater error", { during, ...describeError(error) })

			this.phase = { kind: "idle" }

			if (during === "downloading") {
				const version = this.announcedVersion()
				if (version !== null) {
					this.setAvailability({ kind: "failed", version })
				}
			}

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

		void this.checkForUpdates()
	}

	/**
	 * The same release is found again on every check until it is applied, so a
	 * check that confirms what already stands changes nothing and is not resent.
	 * A download already under way outranks the feed: it is the same version,
	 * further along.
	 */
	private announce(info: UpdateInfo): void {
		if (this.availability.kind !== "none" && this.availability.version === info.version) return

		this.setAvailability({ kind: "available", version: info.version })
	}

	private setAvailability(next: UpdateAvailability): void {
		this.availability = next
		this.sendAvailability()
	}

	private announcedVersion(): string | null {
		return this.availability.kind === "none" ? null : this.availability.version
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
			void this.checkForUpdates()
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

	/** These events now fire for as long as the app runs, so a window that went away must not throw. */
	private liveWindow(): BrowserWindow | null {
		const window = this.mainWindow
		return window === null || window.isDestroyed() ? null : window
	}

	/**
	 * A push for a renderer that is already listening. One that is not, because
	 * the release was found before the window finished loading, asks for the
	 * same value through `getCurrentUpdate`.
	 */
	private sendAvailability(): void {
		const window = this.liveWindow()
		if (window === null) return

		window.webContents.send("update:availability", this.availability)
	}

	/** What stands right now, for a renderer that mounted after it was found. */
	public getCurrentUpdate(): UpdateAvailability {
		return this.availability
	}

	/** The scheduled check. Its answer is the announcement, so nothing reads the result. */
	public async checkForUpdates(): Promise<void> {
		if (is.dev && !process.env.FORCE_UPDATE_CHECK) {
			logger.info("Skip update check in development mode (set FORCE_UPDATE_CHECK=1 to override)")
			return
		}

		await this.runCheck()
	}

	/**
	 * A check a person asked for, answered back to them. It runs in development
	 * too, and it raises no dialog: the screen the press came from is where the
	 * answer belongs, including the answer that the check itself failed.
	 */
	public async checkNow(): Promise<UpdateCheckResult> {
		return this.runCheck()
	}

	private async runCheck(): Promise<UpdateCheckResult> {
		if (this.phase.kind !== "idle") {
			logger.info("Updater is busy, skipping this check", { phase: this.phase.kind })
			return { kind: "busy" }
		}

		this.phase = { kind: "checking" }
		this.lastCheckAt = this.clock.now()

		logger.info("Checking for updates", {
			currentVersion: app.getVersion(),
			installedAs: this.install.kind,
			retryAttempt: this.retryAttempt,
		})

		try {
			await autoUpdater.checkForUpdates()

			// The feed answered through an event while this was in flight, so what
			// stands now is what this check found.
			return this.availability.kind === "none"
				? { kind: "up-to-date" }
				: { kind: "found", version: this.availability.version }
		} catch (error) {
			logger.error("Error checking for updates", describeError(error))
			return { kind: "failed" }
		} finally {
			// A download started from the header button while this was in flight
			// keeps the phase it set.
			if (this.phase.kind === "checking") {
				this.phase = { kind: "idle" }
			}
		}
	}

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

	/** Only an installed copy can do this: a portable one is sent to the release page. */
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

	public getInstallationType(): UpdateInstallKind {
		return this.install.kind === "portable" ? "portable" : "setup"
	}

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
