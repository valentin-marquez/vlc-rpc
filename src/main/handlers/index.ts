import { logger } from "@main/core/logger"
import { MetadataHandler } from "@main/features/cover/cover.handler"
import { DiscordRpcHandler } from "@main/features/discord/discord.handler"
import { MediaInfoHandler } from "@main/features/media/media.handler"
import { UpdateHandler } from "@main/features/updates/updates.handler"
import { VlcConfigHandler } from "@main/features/vlc/vlc-config.handler"
import { VlcStatusHandler } from "@main/features/vlc/vlc-status.handler"
import { AppInfoHandler } from "@main/handlers/app-info-handler"

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
