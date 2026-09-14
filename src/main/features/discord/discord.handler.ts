import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { discordRpcService } from "@main/features/discord/discord.client"
import { mediaStateService } from "@main/features/presence/presence.state"
import { vlcStatusService } from "@main/features/vlc/vlc.client"

/**
 * Handler for Discord RPC operations
 */
export class DiscordRpcHandler {
	private updateIntervalId: NodeJS.Timeout | null = null
	private fastCheckIntervalId: NodeJS.Timeout | null = null
	private fastCheckCount = 0
	private maxFastChecks = 5

	constructor() {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("discord:connect", async () => {
			return await discordRpcService.connect()
		})

		registerHandler("discord:disconnect", async () => {
			await discordRpcService.close()
			return true
		})

		registerHandler("discord:status", () => {
			return discordRpcService.isConnected()
		})

		registerHandler("discord:update", async () => {
			return await this.updatePresence(true)
		})

		registerHandler("discord:start-loop", async () => {
			return this.startUpdateLoop()
		})

		registerHandler("discord:stop-loop", () => {
			this.stopUpdateLoop()
			return true
		})

		registerHandler("discord:reconnect", async () => {
			logger.info("Forcing Discord reconnection")
			return await discordRpcService.forceReconnect()
		})

		registerHandler("discord:rpc:enable", () => {
			discordRpcService.enableRpc()
			return true
		})

		registerHandler("discord:rpc:disable", () => {
			discordRpcService.disableRpc()
			return true
		})

		registerHandler("discord:rpc:disable:temporary", (minutes) => {
			discordRpcService.disableRpcTemporary(minutes)
			return true
		})

		registerHandler("discord:rpc:status", () => {
			return discordRpcService.isRpcEnabled()
		})
	}

	/**
	 * Start the update loop for Discord presence
	 */
	public startUpdateLoop(): boolean {
		if (this.updateIntervalId !== null) {
			return true // Already running
		}

		try {
			discordRpcService
				.connect()
				.then((connected) => {
					// Even if initial connection fails, we still set up the loop
					// as reconnection logic will handle retries
					logger.info("Starting Discord presence update loop")

					this.updatePresence(connected)

					this.startFastCheckInterval()

					const updateInterval =
						Math.max(1, Math.min(15, Number(process.env.UPDATE_INTERVAL) || 10)) * 1000
					this.updateIntervalId = setInterval(() => {
						this.updatePresence(false)
					}, updateInterval)
				})
				.catch((error) => {
					logger.error(`Initial Discord connection failed: ${error}`)
				})

			return true
		} catch (error) {
			logger.error(`Failed to start Discord presence update loop: ${error}`)
			return false
		}
	}

	/**
	 * Start a fast check interval for initial updates
	 */
	private startFastCheckInterval(): void {
		if (this.fastCheckIntervalId !== null) {
			clearInterval(this.fastCheckIntervalId)
		}

		this.fastCheckCount = 0
		const fastCheckInterval = 1000 // 1 second

		this.fastCheckIntervalId = setInterval(() => {
			this.fastCheckCount++
			this.updatePresence(false)

			if (this.fastCheckCount >= this.maxFastChecks) {
				if (this.fastCheckIntervalId !== null) {
					clearInterval(this.fastCheckIntervalId)
					this.fastCheckIntervalId = null
				}
			}
		}, fastCheckInterval)
	}

	/**
	 * Stop the update loop
	 */
	public stopUpdateLoop(): void {
		logger.info("Stopping Discord presence update loop")

		if (this.updateIntervalId !== null) {
			clearInterval(this.updateIntervalId)
			this.updateIntervalId = null
		}

		if (this.fastCheckIntervalId !== null) {
			clearInterval(this.fastCheckIntervalId)
			this.fastCheckIntervalId = null
		}

		discordRpcService.clear().catch((error) => {
			logger.error(`Error clearing Discord presence: ${error}`)
		})
	}

	/**
	 * Update Discord presence based on current VLC status
	 */
	private async updatePresence(forceUpdate = false): Promise<boolean> {
		try {
			const vlcStatus = await vlcStatusService.readStatus(forceUpdate)

			if (!vlcStatus) {
				return await discordRpcService.clear()
			}

			const presenceData = await mediaStateService.getDiscordPresence(vlcStatus)

			if (!presenceData) {
				return await discordRpcService.clear()
			}

			return await discordRpcService.update(presenceData)
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			return false
		}
	}
}
