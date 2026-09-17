import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Client } from "./vlc.client"

/**
 * Handler for VLC status operations
 */
export class VlcStatusHandler {
	constructor(private readonly vlc: Client) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("vlc:status:get", async (forceUpdate = false) => {
			logger.info(`Reading VLC status (forceUpdate: ${forceUpdate})`)
			return await this.vlc.readStatus(forceUpdate)
		})

		registerHandler("vlc:status:check", async () => {
			const status = await this.vlc.checkVlcStatus()
			logger.info(`Checked VLC connection status: ${status.reason}`)
			return status
		})
	}

	/**
	 * Update VLC connection info when config changes
	 */
	public updateConnectionInfo(): void {
		this.vlc.updateConnectionInfo()
	}
}
