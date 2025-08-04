import { logger } from "@main/services/logger"
import { startupService } from "@main/services/startup"
import { ipcMain } from "electron"

/**
 * Handler for app info requests
 */
export class AppInfoHandler {
	constructor() {
		this.initializeHandlers()
		logger.info("App info handler initialized")
	}

	/**
	 * Initialize IPC handlers for app info
	 */
	private initializeHandlers(): void {
		ipcMain.handle("app:isPortable", this.handleIsPortable.bind(this))
	}

	/**
	 * Handle request to check if app is portable
	 */
	private async handleIsPortable(): Promise<boolean> {
		try {
			const isPortable = startupService.isPortable()
			logger.info(`App is portable: ${isPortable}`)
			return isPortable
		} catch (error) {
			logger.error(`Failed to check if portable: ${error}`)
			return false
		}
	}
}
