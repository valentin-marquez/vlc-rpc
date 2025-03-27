import { DiscordRpcHandler } from "@main/handlers/discord-rpc-handler"
import { MediaInfoHandler } from "@main/handlers/media-info-handler"
import { UpdateHandler } from "@main/handlers/update-handler"
import { VlcConfigHandler } from "@main/handlers/vlc-config-handler"
import { VlcStatusHandler } from "@main/handlers/vlc-status-handler"
import { logger } from "@main/services/logger"

/**
 * Main handlers registry
 *
 * Initializes and manages all handlers for the main process
 */
export class MainHandlers {
	private static instance: MainHandlers | null = null

	// Handlers
	public vlcConfigHandler: VlcConfigHandler
	public vlcStatusHandler: VlcStatusHandler
	public discordRpcHandler: DiscordRpcHandler
	public mediaInfoHandler: MediaInfoHandler
	public updateHandler: UpdateHandler

	private constructor() {
		logger.info("Initializing main process handlers")

		// Initialize handlers
		this.vlcConfigHandler = new VlcConfigHandler()
		this.vlcStatusHandler = new VlcStatusHandler()
		this.discordRpcHandler = new DiscordRpcHandler()
		this.mediaInfoHandler = new MediaInfoHandler()
		this.updateHandler = new UpdateHandler()

		logger.info("Main process handlers initialized")
	}

	/**
	 * Get the singleton instance of the main handlers registry
	 */
	public static getInstance(): MainHandlers {
		if (!MainHandlers.instance) {
			MainHandlers.instance = new MainHandlers()
		}
		return MainHandlers.instance
	}
}

// Export singleton instance
export const mainHandlers = MainHandlers.getInstance()
