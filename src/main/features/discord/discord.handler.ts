import type { Clock } from "@main/core/clock"
import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { Timeline, presenceKey } from "@main/features/presence"
import type { Service as PresenceService } from "@main/features/presence"
import type { Client as VlcClient } from "@main/features/vlc"
import type { Client as DiscordClient } from "./discord.client"

/**
 * Handler for Discord RPC operations
 */
export class DiscordRpcHandler {
	private pollIntervalId: NodeJS.Timeout | null = null
	private readonly timeline: Timeline
	private lastSentKey: string | null = null
	private wasConnected = false

	constructor(
		private readonly discord: DiscordClient,
		private readonly vlc: VlcClient,
		private readonly presence: PresenceService,
		clock: Clock,
	) {
		this.timeline = new Timeline(clock)
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("discord:connect", async () => {
			return await this.discord.connect()
		})

		registerHandler("discord:disconnect", async () => {
			await this.discord.close()
			return true
		})

		registerHandler("discord:status", () => {
			return this.discord.isConnected()
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
			return await this.discord.forceReconnect()
		})

		registerHandler("discord:rpc:enable", () => {
			this.discord.enableRpc()
			return true
		})

		registerHandler("discord:rpc:disable", () => {
			this.discord.disableRpc()
			return true
		})

		registerHandler("discord:rpc:disable:temporary", (minutes) => {
			this.discord.disableRpcTemporary(minutes)
			return true
		})

		registerHandler("discord:rpc:status", () => {
			return this.discord.isRpcEnabled()
		})
	}

	private pollIntervalMs(): number {
		const configured = configService.get("presenceUpdateInterval")
		return Math.max(500, Math.min(10000, configured || 1500))
	}

	/**
	 * Start the update loop for Discord presence
	 */
	public startUpdateLoop(): boolean {
		if (this.pollIntervalId !== null) {
			return true // Already running
		}

		try {
			this.discord.connect().catch((error) => {
				logger.error(`Initial Discord connection failed: ${error}`)
			})

			logger.info("Starting Discord presence update loop")
			this.updatePresence(false)
			this.pollIntervalId = setInterval(() => {
				this.updatePresence(false)
			}, this.pollIntervalMs())

			return true
		} catch (error) {
			logger.error(`Failed to start Discord presence update loop: ${error}`)
			return false
		}
	}

	/**
	 * Stop the update loop
	 */
	public stopUpdateLoop(): void {
		logger.info("Stopping Discord presence update loop")

		if (this.pollIntervalId !== null) {
			clearInterval(this.pollIntervalId)
			this.pollIntervalId = null
		}

		this.lastSentKey = null
		this.wasConnected = false

		this.discord.clear().catch((error) => {
			logger.error(`Error clearing Discord presence: ${error}`)
		})
	}

	/**
	 * Update Discord presence based on current VLC status. Diffs by
	 * presenceKey so an unchanged status skips the actual Discord call, and
	 * always resends right after a reconnect since Discord has lost state.
	 */
	private async updatePresence(force: boolean): Promise<boolean> {
		try {
			const isConnected = this.discord.isConnected()
			const justReconnected = isConnected && !this.wasConnected
			this.wasConnected = isConnected

			const vlcStatus = await this.vlc.readStatus(force)
			if (!vlcStatus) {
				return this.pushClear()
			}

			const window = this.timeline.update(vlcStatus)
			const key = presenceKey(vlcStatus, this.timeline.currentEpoch)

			if (!force && !justReconnected && key === this.lastSentKey) {
				return true
			}

			const presenceData = await this.presence.getDiscordPresence(vlcStatus, window)
			if (!presenceData) {
				return this.pushClear()
			}

			const sent = await this.discord.update(presenceData)
			if (sent) {
				this.lastSentKey = key
			}
			return sent
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			return false
		}
	}

	private async pushClear(): Promise<boolean> {
		this.lastSentKey = null
		return await this.discord.clear()
	}
}
