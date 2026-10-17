import type { Clock } from "@main/core/clock"
import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { DiscordPresenceData } from "@shared/presence/presence.types"

import {
	Client as RpcClient,
	type SetActivity,
	type SetActivityResponse,
	StatusDisplayType,
} from "@xhayper/discord-rpc"

export class Client {
	private rpc: RpcClient | null = null
	private connected = false
	private readonly clientId = "1345358480671772683"
	private connectPromise: Promise<boolean> | null = null
	private reconnectTimer: NodeJS.Timeout | null = null
	private reconnectAttempts = 0
	private reconnectDelay = 5000 // 5 seconds
	private appName: string | null = null

	constructor(private readonly clock: Clock) {
		logger.info("Discord RPC service initialized")
	}

	/**
	 * Single source of truth for whether the presence may be published. A
	 * temporary window wins over the permanent flag while it runs, and is
	 * deleted the moment it elapses so a stale timestamp cannot keep answering
	 * for a user who never asked for it.
	 */
	public isRpcEnabled(): boolean {
		const disabledUntil = configService.get("rpcDisabledUntil")

		if (disabledUntil !== undefined) {
			if (this.clock.now() < disabledUntil) {
				return false
			}

			configService.delete("rpcDisabledUntil")
		}

		return configService.get("rpcEnabled")
	}

	public enableRpc(): void {
		configService.set("rpcEnabled", true)
		configService.delete("rpcDisabledUntil")
		logger.info("RPC enabled")
	}

	public disableRpc(): void {
		configService.set("rpcEnabled", false)
		configService.delete("rpcDisabledUntil")

		this.clear().catch((error) => {
			logger.error(`Error clearing Discord presence when disabling RPC: ${error}`)
		})

		logger.info("RPC disabled")
	}

	public disableRpcTemporary(minutes: number): void {
		// The permanent flag stays on: the window above it is what is temporary.
		configService.set("rpcEnabled", true)
		configService.set("rpcDisabledUntil", this.clock.now() + minutes * 60 * 1000)

		this.clear().catch((error) => {
			logger.error(`Error clearing Discord presence when temporarily disabling RPC: ${error}`)
		})

		logger.info(`RPC temporarily disabled for ${minutes} minutes`)
	}

	public isConnected(): boolean {
		return this.connected && this.rpc?.isConnected === true
	}

	/**
	 * What Discord calls this application, learned from its reply to an update that named
	 * no activity. It is the header line of every presence the arrangement leaves unnamed,
	 * so the preview needs it to draw the header the profile draws. Null until Discord has
	 * accepted one such update.
	 */
	public applicationName(): string | null {
		return this.appName
	}

	public connect(): Promise<boolean> {
		if (this.isConnected()) {
			return Promise.resolve(true)
		}

		if (this.connectPromise) {
			return this.connectPromise
		}

		if (this.reconnectTimer) {
			return Promise.resolve(false)
		}

		this.connectPromise = this.openConnection().finally(() => {
			this.connectPromise = null
		})
		return this.connectPromise
	}

	private async openConnection(): Promise<boolean> {
		const previous = this.rpc
		const rpc = new RpcClient({ clientId: this.clientId })
		this.rpc = rpc
		this.connected = false
		this.appName = null

		try {
			if (previous) await this.destroyRpc(previous)
			if (this.rpc !== rpc) return false

			rpc.on("ready", () => {
				if (this.rpc !== rpc) return
				logger.info("Connected to Discord")
				this.connected = true
				this.reconnectAttempts = 0
			})

			rpc.on("disconnected", () => {
				if (this.rpc !== rpc) return
				logger.info("Disconnected from Discord")
				this.connected = false
				this.startReconnectTimer()
			})

			rpc.on("error", (err) => {
				if (this.rpc !== rpc) return
				logger.error(`Discord RPC error: ${err}`)
				this.connected = false
				this.startReconnectTimer()
			})

			await rpc.login()
			if (this.rpc !== rpc) {
				await this.destroyRpc(rpc)
				return false
			}
			this.connected = true
			logger.info("Connected to Discord RPC")
			return true
		} catch (error) {
			if (this.rpc !== rpc) {
				await this.destroyRpc(rpc)
				return false
			}
			logger.error(`Failed to connect to Discord: ${error}`)
			this.connected = false
			this.rpc = null
			const cleanup = this.destroyRpc(rpc)
			this.startReconnectTimer()
			await cleanup
			return false
		}
	}

	private startReconnectTimer(): void {
		if (this.reconnectTimer) return

		logger.info(`Scheduling Discord reconnection attempt in ${this.reconnectDelay / 1000} seconds`)

		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null
			this.reconnectAttempts++
			logger.info(`Attempting to reconnect to Discord (attempt ${this.reconnectAttempts})`)

			try {
				if (!this.isConnected()) {
					await this.connect()
				}
			} catch (error) {
				logger.error(`Reconnection attempt failed: ${error}`)
				this.startReconnectTimer()
			}
		}, this.reconnectDelay)
	}

	private stopReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}

	/** Joins an active login, otherwise replaces the previous connection. */
	public forceReconnect(): Promise<boolean> {
		if (this.connectPromise) return this.connectPromise
		this.stopReconnectTimer()
		this.connected = false
		this.reconnectAttempts = 0
		return this.connect()
	}

	public async update(presenceData: DiscordPresenceData): Promise<boolean> {
		if (!this.isRpcEnabled()) {
			logger.info("RPC is disabled, skipping presence update")
			return false
		}

		// Polling must not queue stale activities behind an in-flight login.
		if (!this.isConnected() && (this.connectPromise !== null || !(await this.connect()))) {
			return false
		}

		const rpc = this.rpc
		if (!rpc?.user) {
			return false
		}

		try {
			const config = configService.get()

			const activity: SetActivity = {
				largeImageKey: presenceData.large_image || config.largeImage,
				instance: presenceData.instance !== undefined ? presenceData.instance : false,
				statusDisplayType: StatusDisplayType.DETAILS,
			}

			// Discord draws this as a line of the activity, not only as hover text, so a
			// default here would be words nobody asked for sitting on a profile.
			if (presenceData.large_text) {
				activity.largeImageText = presenceData.large_text
			}

			if (presenceData.details !== undefined) {
				activity.details = presenceData.details
			}

			if (presenceData.state !== undefined) {
				activity.state = presenceData.state
			}

			if (presenceData.name) {
				activity.name = presenceData.name
			}

			if (presenceData.small_image) {
				activity.smallImageKey = presenceData.small_image
			}

			if (presenceData.small_text) {
				activity.smallImageText = presenceData.small_text
			}

			// The presence carries seconds, Discord's client takes milliseconds.
			if (presenceData.start_timestamp) {
				activity.startTimestamp = presenceData.start_timestamp * 1000
			}

			if (presenceData.end_timestamp) {
				activity.endTimestamp = presenceData.end_timestamp * 1000
			}

			if (presenceData.party_id) {
				activity.partyId = presenceData.party_id
			}

			if (presenceData.party_size) {
				activity.partySize = presenceData.party_size[0]
				activity.partyMax = presenceData.party_size[1]
			}

			if (presenceData.buttons && presenceData.buttons.length > 0) {
				activity.buttons = presenceData.buttons
			}

			if (presenceData.activity_type !== undefined) {
				activity.type = presenceData.activity_type
			} else {
				activity.type = 0
			}

			const drawn: SetActivityResponse | undefined = await rpc.user.setActivity(activity)
			if (this.rpc !== rpc) return false

			// Discord answers with the activity as it registered it, and its name is the
			// header line. When the arrangement names nothing, that name is whatever this
			// application is called on Discord, which no code here can work out.
			if (activity.name === undefined) {
				this.appName = typeof drawn?.name === "string" && drawn.name !== "" ? drawn.name : null
			}

			logger.info("Updated Discord Rich Presence")
			return true
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			// A rejected activity does not disconnect an otherwise healthy IPC socket.
			if (this.rpc === rpc && !rpc.isConnected) {
				this.connected = false
				this.startReconnectTimer()
			}
			return false
		}
	}

	public async clear(): Promise<boolean> {
		if (!this.isConnected()) {
			return false
		}

		const rpc = this.rpc
		if (!rpc?.user) {
			return false
		}

		try {
			await rpc.user.clearActivity()
			if (this.rpc !== rpc) return false
			logger.info("Cleared Discord Rich Presence")
			return true
		} catch (error) {
			logger.error(`Error clearing Discord presence: ${error}`)
			if (this.rpc === rpc && !rpc.isConnected) {
				this.connected = false
				this.startReconnectTimer()
			}
			return false
		}
	}

	public async close(): Promise<void> {
		this.stopReconnectTimer()
		const rpc = this.rpc
		const wasConnected = this.connected
		this.rpc = null
		this.connected = false
		this.appName = null
		if (rpc) {
			try {
				if (wasConnected && rpc.user) {
					await rpc.user.clearActivity()
				}
				logger.info("Closed Discord connection")
			} catch (error) {
				logger.error(`Error closing Discord connection: ${error}`)
			} finally {
				await this.destroyRpc(rpc)
			}
		}
	}

	private async destroyRpc(rpc: RpcClient): Promise<void> {
		try {
			await rpc.destroy()
		} catch (error) {
			logger.error(`Error destroying Discord connection: ${error}`)
		}
	}
}
