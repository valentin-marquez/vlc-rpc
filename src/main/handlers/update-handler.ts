import { autoUpdaterService } from "@main/services/auto-updater"
import { logger } from "@main/services/logger"
import { IpcChannels } from "@shared/types"
import { ipcMain } from "electron"

/**
 * Handler for application update operations
 */
export class UpdateHandler {
	constructor() {
		this.registerIpcHandlers()
	}

	/**
	 * Register IPC handlers for update operations
	 */
	private registerIpcHandlers(): void {
		// Check for updates
		ipcMain.handle(`${IpcChannels.UPDATE}:check`, async (_, silent = true) => {
			logger.info(`Requested update check (silent: ${silent})`)
			autoUpdaterService.checkForUpdates(silent)
			return true
		})

		// Download update
		ipcMain.handle(`${IpcChannels.UPDATE}:download`, async () => {
			logger.info("Requested update download")
			autoUpdaterService.downloadUpdate()
			return true
		})
	}
}
