import { discordRpcService } from "@main/services/discord-rpc"
import { logger } from "@main/services/logger"
import { mediaStateService } from "@main/services/media-state"
import { vlcStatusService } from "@main/services/vlc-status"
import { IpcChannels } from "@shared/types"
import { ipcMain } from "electron"

/**
 * Handler for Discord RPC operations
 */
export class DiscordRpcHandler {
	private updateIntervalId: NodeJS.Timeout | null = null
	private fastCheckIntervalId: NodeJS.Timeout | null = null
	private fastCheckCount = 0
	private maxFastChecks = 5

	constructor() {
		this.registerIpcHandlers()
	}

	/**
	 * Register IPC handlers for Discord RPC
	 */
	private registerIpcHandlers(): void {
		// Connect to Discord
		ipcMain.handle(`${IpcChannels.DISCORD}:connect`, async () => {
			return await discordRpcService.connect()
		})

		// Disconnect from Discord
		ipcMain.handle(`${IpcChannels.DISCORD}:disconnect`, async () => {
			await discordRpcService.close()
			return true
		})

		// Check Discord connection status
		ipcMain.handle(`${IpcChannels.DISCORD}:status`, () => {
			return discordRpcService.isConnected()
		})

		// Manually update Discord presence
		ipcMain.handle(`${IpcChannels.DISCORD}:update`, async () => {
			return await this.updatePresence(true)
		})

		// Start the presence update loop
		ipcMain.handle(`${IpcChannels.DISCORD}:start-loop`, async () => {
			return this.startUpdateLoop()
		})

		// Stop the presence update loop
		ipcMain.handle(`${IpcChannels.DISCORD}:stop-loop`, () => {
			this.stopUpdateLoop()
			return true
		})

		// Force reconnection to Discord
		ipcMain.handle(`${IpcChannels.DISCORD}:reconnect`, async () => {
			logger.info("Forcing Discord reconnection")
			return await discordRpcService.forceReconnect()
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
			// Connect to Discord first
			discordRpcService
				.connect()
				.then((connected) => {
					// Even if initial connection fails, we still set up the loop
					// as reconnection logic will handle retries
					logger.info("Starting Discord presence update loop")

					// Initial update
					this.updatePresence(connected)

					// Start fast check interval for the first few checks (for better responsiveness)
					this.startFastCheckInterval()

					// Regular update interval (longer, to avoid rate limits)
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
				// Stop the fast check interval after maxFastChecks
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

		// Clear Discord presence
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
				// No status available, clear Discord presence
				return await discordRpcService.clear()
			}

			// Get the Discord presence data from the media state service
			const presenceData = await mediaStateService.getDiscordPresence(vlcStatus)

			if (!presenceData) {
				// No presence data available, clear Discord presence
				return await discordRpcService.clear()
			}

			// Update Discord presence
			return await discordRpcService.update(presenceData)
		} catch (error) {
			logger.error(`Error updating Discord presence: ${error}`)
			return false
		}
	}

	/**
	 * Update Discord client ID when it changes in settings
	 */
	public updateClientId(clientId: string): void {
		discordRpcService.updateClientId(clientId)
	}
}
