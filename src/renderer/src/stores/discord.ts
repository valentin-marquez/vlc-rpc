import { logger } from "@renderer/lib/utils"
import { discordStatusStore } from "@renderer/stores/app-status"
import { atom } from "nanostores"

// Store for Discord errors
export const discordErrorStore = atom<string | null>(null)

// Store for update loop status
export const discordUpdateLoopStore = atom<boolean>(false)

// Store to track last reconnection attempt time
export const lastReconnectAttemptStore = atom<number>(0)

// Minimum time between reconnection attempts in milliseconds (30 seconds)
const RECONNECT_COOLDOWN = 30000

// Get Discord connection status
export async function checkDiscordStatus(): Promise<boolean> {
	try {
		const isConnected = await window.api.discord.getStatus()
		const wasConnected = discordStatusStore.get() === "connected"

		discordStatusStore.set(isConnected ? "connected" : "disconnected")

		if (isConnected) {
			discordErrorStore.set(null)
		} else if (wasConnected) {
			// Was previously connected but now disconnected
			logger.info("Discord disconnected - will try to reconnect")
			tryReconnect()
		}

		logger.info(`Discord status checked: ${isConnected ? "connected" : "disconnected"}`)
		return isConnected
	} catch (error) {
		discordStatusStore.set("error")
		discordErrorStore.set("Failed to check Discord status")
		logger.error(`Error checking Discord status: ${error}`)
		return false
	}
}

/**
 * Try to reconnect to Discord with cooldown to avoid hammering the API
 */
export async function tryReconnect(): Promise<void> {
	const now = Date.now()
	const lastAttempt = lastReconnectAttemptStore.get()

	// Don't attempt reconnect too frequently
	if (now - lastAttempt < RECONNECT_COOLDOWN) {
		logger.info("Reconnect attempt too soon, skipping")
		return
	}

	lastReconnectAttemptStore.set(now)
	logger.info("Attempting to reconnect to Discord")

	try {
		const reconnected = await window.api.discord.reconnect()
		if (reconnected) {
			discordStatusStore.set("connected")
			discordErrorStore.set(null)
			logger.info("Successfully reconnected to Discord")

			// Restart update loop
			await startDiscordUpdateLoop()
		} else {
			logger.warn("Failed to reconnect to Discord")
		}
	} catch (error) {
		logger.error(`Error during Discord reconnection: ${error}`)
	}
}

// Connect to Discord
export async function connectToDiscord(): Promise<boolean> {
	try {
		discordStatusStore.set("connecting")
		const success = await window.api.discord.connect()

		if (success) {
			discordStatusStore.set("connected")
			discordErrorStore.set(null)
			logger.info("Connected to Discord")
		} else {
			discordStatusStore.set("error")
			discordErrorStore.set("Failed to connect to Discord")
			logger.error("Failed to connect to Discord")
		}

		return success
	} catch (error) {
		discordStatusStore.set("error")
		discordErrorStore.set("Error connecting to Discord")
		logger.error(`Error connecting to Discord: ${error}`)
		return false
	}
}

// Disconnect from Discord
export async function disconnectFromDiscord(): Promise<boolean> {
	try {
		const success = await window.api.discord.disconnect()

		if (success) {
			discordStatusStore.set("disconnected")
			logger.info("Disconnected from Discord")
		}

		return success
	} catch (error) {
		logger.error(`Error disconnecting from Discord: ${error}`)
		return false
	}
}

// Start Discord presence update loop
export async function startDiscordUpdateLoop(): Promise<boolean> {
	try {
		const success = await window.api.discord.startUpdateLoop()

		if (success) {
			discordUpdateLoopStore.set(true)
			logger.info("Discord presence update loop started")
		}

		return success
	} catch (error) {
		logger.error(`Error starting Discord update loop: ${error}`)
		return false
	}
}

// Stop Discord presence update loop
export async function stopDiscordUpdateLoop(): Promise<boolean> {
	try {
		const success = await window.api.discord.stopUpdateLoop()

		if (success) {
			discordUpdateLoopStore.set(false)
			logger.info("Discord presence update loop stopped")
		}

		return success
	} catch (error) {
		logger.error(`Error stopping Discord update loop: ${error}`)
		return false
	}
}

// Manually update Discord presence
export async function updateDiscordPresence(): Promise<boolean> {
	try {
		const success = await window.api.discord.updatePresence()

		if (success) {
			logger.info("Discord presence updated manually")
		} else {
			logger.warn("Failed to update Discord presence")
		}

		return success
	} catch (error) {
		logger.error(`Error updating Discord presence: ${error}`)
		return false
	}
}

// Initialize Discord store
export async function initializeDiscordStore(): Promise<void> {
	// Check current connection status
	const isConnected = await checkDiscordStatus()

	// If connected, check if update loop is active
	if (isConnected) {
		try {
			// Start update loop if not already running
			await startDiscordUpdateLoop()
		} catch (error) {
			logger.error(`Error initializing Discord update loop: ${error}`)
		}
	} else {
		// Try to connect if not connected
		logger.info("Discord not connected on app start, attempting connection")
		await connectToDiscord()
	}
}
