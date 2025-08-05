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
		ipcMain.handle(`${IpcChannels.UPDATE}:check`, async (_, silent = true) => {
			logger.info(`Requested update check (silent: ${silent})`)
			await autoUpdaterService.checkForUpdates(silent)
			return true
		})

		ipcMain.handle(`${IpcChannels.UPDATE}:download`, async () => {
			logger.info("Requested update download")
			autoUpdaterService.downloadUpdate()
			return true
		})

		ipcMain.handle(`${IpcChannels.UPDATE}:force-check`, async () => {
			logger.info("Requested force update check")
			await autoUpdaterService.forceCheckForUpdates()
			return true
		})

		ipcMain.handle(`${IpcChannels.UPDATE}:status`, async () => {
			logger.info("Requested update status")
			return autoUpdaterService.getUpdateStatus()
		})

		ipcMain.handle(`${IpcChannels.UPDATE}:installation-type`, async () => {
			logger.info("Requested installation type")
			return autoUpdaterService.getInstallationType()
		})

		ipcMain.handle(`${IpcChannels.UPDATE}:open-cache-folder`, async () => {
			logger.info("Requested to open update cache folder")
			await autoUpdaterService.openCacheFolder()
			return true
		})
	}
}
