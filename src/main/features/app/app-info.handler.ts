import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Startup } from "./app.startup"

export class AppInfoHandler {
	constructor(private readonly startup: Startup) {
		this.registerHandlers()
		logger.info("App info handler initialized")
	}

	private registerHandlers(): void {
		registerHandler("app:is-portable", async () => {
			try {
				const isPortable = this.startup.isPortable()
				logger.info(`App is portable: ${isPortable}`)
				return isPortable
			} catch (error) {
				logger.error(`Failed to check if portable: ${error}`)
				return false
			}
		})
	}
}
