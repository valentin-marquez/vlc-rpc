import { logger } from "@main/services/logger"
import { vlcStatusService } from "@main/services/vlc-status"
import { IpcChannels, IpcEvents } from "@shared/types"
import { ipcMain } from "electron"

/**
 * Handler for VLC status operations
 */
export class VlcStatusHandler {
	constructor() {
		this.registerIpcHandlers()
	}

	/**
	 * Register IPC handlers for VLC status operations
	 */
	private registerIpcHandlers(): void {
		// Get the current VLC status
		ipcMain.handle(
			`${IpcChannels.VLC}:${IpcEvents.VLC_STATUS_GET}`,
			async (_, forceUpdate = false) => {
				logger.info(`Reading VLC status (forceUpdate: ${forceUpdate})`) // Changed to debug
				return await vlcStatusService.readStatus(forceUpdate)
			},
		)

		// Check VLC connection status
		ipcMain.handle(`${IpcChannels.VLC}:${IpcEvents.VLC_STATUS_CHECK}`, async () => {
			logger.info("Checking VLC connection status") // Changed to debug
			return await vlcStatusService.checkVlcStatus()
		})
	}

	/**
	 * Update VLC connection info when config changes
	 */
	public updateConnectionInfo(): void {
		vlcStatusService.updateConnectionInfo()
	}
}
