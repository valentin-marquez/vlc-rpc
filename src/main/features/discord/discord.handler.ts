import type { Clock } from "@main/core/clock"
import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { Timeline, presenceKey } from "@main/features/presence"
import type { Service as PresenceService } from "@main/features/presence"
import type { Client as VlcClient } from "@main/features/vlc"
import type { LastSentPresence, PresenceClearReason } from "@shared/presence/presence.types"
import type { Client as DiscordClient } from "./discord.client"

/**
 * Handler for Discord RPC operations
 */
export class DiscordRpcHandler {
	private pollIntervalId: NodeJS.Timeout | null = null
	private readonly timeline: Timeline
	private lastSentKey: string | null = null
	private wasConnected = false
	private presenceCleared = false
	private lastPresence: LastSentPresence = { kind: "unknown" }

	constructor(
		private readonly discord: DiscordClient,
		private readonly vlc: VlcClient,
		private readonly presence: PresenceService,
		private readonly clock: Clock,
	) {
		this.timeline = new Timeline(clock)
		this.registerHandlers()
	}

	/**
	 * Resend on the next tick even though nothing VLC reports has changed.
	 *
	 * The poll skips Discord whenever `presenceKey` is unchanged, and that key is
	 * built from what VLC reports, which a manual correction does not touch. So
	 * correcting a cover two minutes into an episode would otherwise leave the old
	 * one on screen for the rest of it, and forever on a track that repeats.
	 */
	public forceNextUpdate(): void {
		this.lastSentKey = null
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

		registerHandler("discord:presence:last", () => {
			return this.getLastPresence()
		})
	}

	/**
	 * What Discord was actually given, so the renderer can show the presence
	 * instead of rebuilding it from the same status and hoping the two agree.
	 */
	public getLastPresence(): LastSentPresence {
		return this.lastPresence
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
		this.presenceCleared = false
		this.lastPresence = { kind: "cleared", reason: "loop-stopped" }

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
			if (!this.discord.isRpcEnabled()) {
				// Skipping the update is not enough: the last activity would stay
				// pinned on Discord while the user believes they are hidden.
				return await this.pushClear("rpc-disabled")
			}

			const isConnected = this.discord.isConnected()
			const justReconnected = isConnected && !this.wasConnected
			this.wasConnected = isConnected

			const vlcStatus = await this.vlc.readStatus(force)
			if (!vlcStatus) {
				return this.pushClear("vlc-unavailable")
			}

			const window = this.timeline.update(vlcStatus)
			const key = presenceKey(vlcStatus, this.timeline.currentEpoch)

			if (!force && !justReconnected && key === this.lastSentKey) {
				return true
			}

			const presenceData = await this.presence.getDiscordPresence(vlcStatus, window)
			if (!presenceData) {
				return this.pushClear("playback-stopped")
			}

			const sent = await this.discord.update(presenceData)
			if (sent) {
				this.lastSentKey = key
				this.presenceCleared = false
				// Recorded only once Discord accepted it, so a refused update never
				// shows up as an activity nobody can see.
				this.lastPresence = {
					kind: "sent",
					presence: presenceData,
					sentAt: this.clock.now(),
					applicationName: this.discord.applicationName(),
				}
			}
			return sent
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			return false
		}
	}

	/**
	 * A disable can last half an hour at a poll every second and a half, so the
	 * clear is sent once and repeated only if it failed, for example because
	 * Discord was not connected at the time.
	 */
	private async pushClear(reason: PresenceClearReason): Promise<boolean> {
		this.lastSentKey = null
		this.lastPresence = { kind: "cleared", reason }

		if (this.presenceCleared) {
			return true
		}

		this.presenceCleared = await this.discord.clear()
		return this.presenceCleared
	}
}
