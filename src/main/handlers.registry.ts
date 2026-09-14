import { logger } from "@main/core/logger"
import { AppInfoHandler } from "@main/features/app"
import { MetadataHandler } from "@main/features/cover"
import { DiscordRpcHandler } from "@main/features/discord"
import { MediaInfoHandler } from "@main/features/media"
import { UpdateHandler } from "@main/features/updates"
import { VlcConfigHandler, VlcStatusHandler } from "@main/features/vlc"

/**
 * Main handlers registry
 *
 * Initializes and manages all handlers for the main process
 */
export class MainHandlers {
	private static instance: MainHandlers | null = null

	public appInfoHandler: AppInfoHandler
	public vlcConfigHandler: VlcConfigHandler
	public vlcStatusHandler: VlcStatusHandler
	public discordRpcHandler: DiscordRpcHandler
	public mediaInfoHandler: MediaInfoHandler
	public metadataHandler: MetadataHandler
	public updateHandler: UpdateHandler

	private constructor() {
		logger.info("Initializing main process handlers")

		this.appInfoHandler = new AppInfoHandler()
		this.vlcConfigHandler = new VlcConfigHandler()
		this.vlcStatusHandler = new VlcStatusHandler()
		this.discordRpcHandler = new DiscordRpcHandler()
		this.mediaInfoHandler = new MediaInfoHandler()
		this.metadataHandler = new MetadataHandler()
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

export const mainHandlers = MainHandlers.getInstance()
