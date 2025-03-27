import { logger } from "@renderer/lib/utils"
import { discordStatusStore } from "@renderer/stores/app-status"
import { atom } from "nanostores"

export const discordErrorStore = atom<string | null>(null)
export const discordUpdateLoopStore = atom<boolean>(false)
export const lastReconnectAttemptStore = atom<number>(0)

const RECONNECT_COOLDOWN = 30000

export async function checkDiscordStatus(): Promise<boolean> {
	try {
		const isConnected = await window.api.discord.getStatus()
		const wasConnected = discordStatusStore.get() === "connected"

		discordStatusStore.set(isConnected ? "connected" : "disconnected")

		if (isConnected) {
			discordErrorStore.set(null)
		} else if (wasConnected) {
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

			await startDiscordUpdateLoop()
		} else {
			logger.warn("Failed to reconnect to Discord")
		}
	} catch (error) {
		logger.error(`Error during Discord reconnection: ${error}`)
	}
}

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

export async function initializeDiscordStore(): Promise<void> {
	const isConnected = await checkDiscordStatus()

	if (isConnected) {
		try {
			await startDiscordUpdateLoop()
		} catch (error) {
			logger.error(`Error initializing Discord update loop: ${error}`)
		}
	} else {
		logger.info("Discord not connected on app start, attempting connection")
		await connectToDiscord()
	}
}
