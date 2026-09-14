import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { vlcStatusService } from "@main/features/vlc/vlc.client"

/**
 * Handler for VLC status operations
 */
export class VlcStatusHandler {
	constructor() {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("vlc:status:get", async (forceUpdate = false) => {
			logger.info(`Reading VLC status (forceUpdate: ${forceUpdate})`)
			return await vlcStatusService.readStatus(forceUpdate)
		})

		registerHandler("vlc:status:check", async () => {
			logger.info("Checking VLC connection status")
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
