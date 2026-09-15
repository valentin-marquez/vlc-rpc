import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Updater } from "./app.updater"

/**
 * Handler for application update operations
 */
export class UpdateHandler {
	constructor(private readonly updater: Updater) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("update:check", async (silent = true) => {
			logger.info(`Requested update check (silent: ${silent})`)
			await this.updater.checkForUpdates(silent)
			return true
		})

		registerHandler("update:download", async () => {
			logger.info("Requested update download")
			this.updater.downloadUpdate()
			return true
		})

		registerHandler("update:force-check", async () => {
			logger.info("Requested force update check")
			await this.updater.forceCheckForUpdates()
			return true
		})

		registerHandler("update:status", async () => {
			logger.info("Requested update status")
			return this.updater.getUpdateStatus()
		})

		registerHandler("update:installation-type", async () => {
			logger.info("Requested installation type")
			return this.updater.getInstallationType()
		})

		registerHandler("update:open-cache-folder", async () => {
			logger.info("Requested to open update cache folder")
			await this.updater.openCacheFolder()
			return undefined
		})
	}
}
