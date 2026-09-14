import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { autoUpdaterService } from "./app.updater"

/**
 * Handler for application update operations
 */
export class UpdateHandler {
	constructor() {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("update:check", async (silent = true) => {
			logger.info(`Requested update check (silent: ${silent})`)
			await autoUpdaterService.checkForUpdates(silent)
			return true
		})

		registerHandler("update:download", async () => {
			logger.info("Requested update download")
			autoUpdaterService.downloadUpdate()
			return true
		})

		registerHandler("update:force-check", async () => {
			logger.info("Requested force update check")
			await autoUpdaterService.forceCheckForUpdates()
			return true
		})

		registerHandler("update:status", async () => {
			logger.info("Requested update status")
			return autoUpdaterService.getUpdateStatus()
		})

		registerHandler("update:installation-type", async () => {
			logger.info("Requested installation type")
			return autoUpdaterService.getInstallationType()
		})

		registerHandler("update:open-cache-folder", async () => {
			logger.info("Requested to open update cache folder")
			await autoUpdaterService.openCacheFolder()
			return undefined
		})
	}
}
