import type { AppConfig } from "@shared/types"
import type { DiscordPresenceData } from "@shared/types/media"
import { Client, type SetActivity } from "@xhayper/discord-rpc"
import { ActivityType } from "discord-api-types/v10"
import { configService } from "./config"
import { logger } from "./logger"

/**
 * Service for Discord Rich Presence integration
 */
export class DiscordRpcService {
	private static instance: DiscordRpcService | null = null
	private rpc: Client | null = null
	private connected = false
	private clientId: string
	private connecting = false
	private reconnectTimer: NodeJS.Timeout | null = null
	private reconnectAttempts = 0
	private maxReconnectAttempts = 10
	private reconnectDelay = 5000 // 5 seconds

	private constructor() {
		this.clientId = configService.get<string>("clientId")
		logger.info("Discord RPC service initialized")
	}

	/**
	 * Get the singleton instance of the Discord RPC service
	 */
	public static getInstance(): DiscordRpcService {
		if (!DiscordRpcService.instance) {
			DiscordRpcService.instance = new DiscordRpcService()
		}
		return DiscordRpcService.instance
	}

	/**
	 * Check if connected to Discord
	 */
	public isConnected(): boolean {
		return this.connected
	}

	/**
	 * Connect to Discord RPC
	 */
	public async connect(): Promise<boolean> {
		if (this.connected) {
			return true
		}

		if (this.connecting) {
			return false
		}

		this.connecting = true
		this.stopReconnectTimer() // Stop any existing reconnect timer

		try {
			// Refresh client ID in case it was updated in settings
			this.clientId = configService.get<string>("clientId")

			// Create a new client with the current client ID
			this.rpc = new Client({
				clientId: this.clientId,
			})

			// Listen for events
			this.rpc.on("ready", () => {
				logger.info("Connected to Discord")
				this.connected = true
				this.reconnectAttempts = 0 // Reset attempts on successful connection
			})

			this.rpc.on("disconnected", () => {
				logger.info("Disconnected from Discord")
				this.connected = false
				this.startReconnectTimer() // Start attempting to reconnect
			})

			this.rpc.on("error", (err) => {
				logger.error(`Discord RPC error: ${err}`)
				this.connected = false
				this.startReconnectTimer() // Start attempting to reconnect on error
			})

			// Connect to Discord
			await this.rpc.login()
			this.connected = true
			logger.info("Connected to Discord RPC")
			return true
		} catch (error) {
			logger.error(`Failed to connect to Discord: ${error}`)
			this.connected = false
			this.startReconnectTimer() // Start attempting to reconnect
			return false
		} finally {
			this.connecting = false
		}
	}

	/**
	 * Start a reconnection timer that will attempt to reconnect periodically
	 */
	private startReconnectTimer(): void {
		// Don't create multiple timers
		this.stopReconnectTimer()

		// If we've exceeded max attempts, don't try anymore
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			logger.warn(`Exceeded maximum Discord reconnection attempts (${this.maxReconnectAttempts})`)
			return
		}

		logger.info(`Scheduling Discord reconnection attempt in ${this.reconnectDelay / 1000} seconds`)

		this.reconnectTimer = setTimeout(async () => {
			this.reconnectAttempts++
			logger.info(`Attempting to reconnect to Discord (attempt ${this.reconnectAttempts})`)

			try {
				if (!this.connected) {
					await this.connect()
				}
			} catch (error) {
				logger.error(`Reconnection attempt failed: ${error}`)
			}
		}, this.reconnectDelay)
	}

	/**
	 * Stop any active reconnection timer
	 */
	private stopReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}

	/**
	 * Force a reconnection attempt
	 */
	public async forceReconnect(): Promise<boolean> {
		// Clear any existing connection
		if (this.rpc) {
			try {
				await this.rpc.destroy()
			} catch (error) {
				logger.error(`Error destroying previous connection: ${error}`)
			}
			this.rpc = null
		}

		this.connected = false
		this.reconnectAttempts = 0 // Reset reconnect attempts
		return await this.connect()
	}

	/**
	 * Update Discord Rich Presence
	 */
	public async update(presenceData: DiscordPresenceData): Promise<boolean> {
		if (!this.connected && !(await this.connect())) {
			return false
		}

		if (!this.rpc || !this.rpc.user) {
			return false
		}

		try {
			const config = configService.get<AppConfig>()

			// Initialize activity using the library's SetActivity type
			const activity: SetActivity = {
				details: presenceData.details,
				state: presenceData.state,
				largeImageKey: presenceData.large_image || config.largeImage,
				largeImageText: presenceData.large_text || "VLC Media Player",
				instance: presenceData.instance !== undefined ? presenceData.instance : false,
			}

			// Add small image if provided
			if (presenceData.small_image) {
				activity.smallImageKey = presenceData.small_image
			}

			if (presenceData.small_text) {
				activity.smallImageText = presenceData.small_text
			}

			// Add timestamps if provided
			if (presenceData.start_timestamp) {
				activity.startTimestamp = presenceData.start_timestamp * 1000 // Convert to milliseconds
			}

			if (presenceData.end_timestamp) {
				activity.endTimestamp = presenceData.end_timestamp * 1000 // Convert to milliseconds
			}

			// Add party information if provided
			if (presenceData.party_id) {
				activity.partyId = presenceData.party_id
			}

			if (presenceData.party_size) {
				activity.partySize = presenceData.party_size[0]
				activity.partyMax = presenceData.party_size[1]
			}

			// Add buttons if provided
			if (presenceData.buttons && presenceData.buttons.length > 0) {
				activity.buttons = presenceData.buttons
			}

			// Set the activity type - Map from our MediaActivityType to Discord's ActivityType
			if (presenceData.activity_type !== undefined) {
				// Direct conversion is safe because we've aligned the enum values
				activity.type = presenceData.activity_type as unknown as
					| ActivityType.Playing
					| ActivityType.Listening
					| ActivityType.Watching
					| ActivityType.Competing
			} else {
				activity.type = ActivityType.Playing // Default
			}

			// Set the activity using the native method
			await this.rpc.user.setActivity(activity)
			logger.info("Updated Discord Rich Presence")
			return true
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			this.connected = false
			return false
		}
	}

	/**
	 * Clear Discord Rich Presence
	 */
	public async clear(): Promise<boolean> {
		if (!this.connected) {
			return false
		}

		if (!this.rpc || !this.rpc.user) {
			return false
		}

		try {
			// Use the native method to clear activity
			await this.rpc.user.clearActivity()
			logger.info("Cleared Discord Rich Presence")
			return true
		} catch (error) {
			logger.error(`Error clearing Discord presence: ${error}`)
			this.connected = false
			return false
		}
	}

	/**
	 * Close the connection to Discord
	 */
	public async close(): Promise<void> {
		// Stop reconnection attempts
		this.stopReconnectTimer()

		if (this.connected && this.rpc) {
			try {
				// First clear the activity
				if (this.rpc.user) {
					await this.rpc.user.clearActivity()
				}
				// Then destroy the connection
				await this.rpc.destroy()
				this.connected = false
				logger.info("Closed Discord connection")
			} catch (error) {
				logger.error(`Error closing Discord connection: ${error}`)
			} finally {
				this.rpc = null
			}
		}
	}

	/**
	 * Update the client ID
	 */
	public updateClientId(clientId: string): void {
		if (this.clientId !== clientId) {
			this.clientId = clientId

			// If already connected, reconnect with new client ID
			if (this.connected) {
				this.close().then(() => {
					this.connect()
				})
			}
		}
	}
}

export const discordRpcService = DiscordRpcService.getInstance()
