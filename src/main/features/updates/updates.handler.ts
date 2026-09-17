import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Updater } from "./app.updater"

export class UpdateHandler {
	constructor(private readonly updater: Updater) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("update:check", async () => {
			logger.info("Requested update check")
			return this.updater.checkNow()
		})

		registerHandler("update:download", async () => {
			logger.info("Requested update download")
			this.updater.downloadUpdate()
			return true
		})

		registerHandler("update:status", async () => {
			logger.info("Requested update status")
			return this.updater.getUpdateStatus()
		})

		registerHandler("update:current", async () => this.updater.getCurrentUpdate())

		registerHandler("update:installation-type", async () => {
			logger.info("Requested installation type")
			return this.updater.getInstallationType()
		})

		registerHandler("update:open-release-page", async () => {
			logger.info("Requested the release page")
			await this.updater.openReleasePage()
			return undefined
		})
	}
}
