import { logger } from "@renderer/lib/utils"
import { discordStatusStore, lastReconnectAttemptStore } from "./discord.store"

const RECONNECT_COOLDOWN = 30000

export async function checkDiscordStatus(): Promise<boolean> {
	try {
		const isConnected = await window.api.discord.getStatus()
		const wasConnected = discordStatusStore.get() === "connected"

		discordStatusStore.set(isConnected ? "connected" : "disconnected")

		if (!isConnected && wasConnected) {
			logger.info("Discord disconnected - will try to reconnect")
			tryReconnect()
		}

		logger.info(`Discord status checked: ${isConnected ? "connected" : "disconnected"}`)
		return isConnected
	} catch (error) {
		discordStatusStore.set("error")
		logger.error(`Error checking Discord status: ${error}`)
		return false
	}
}

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
			logger.info("Successfully reconnected to Discord")

			await startDiscordUpdateLoop()
		} else {
			logger.warn("Failed to reconnect to Discord")
		}
	} catch (error) {
		logger.error(`Error during Discord reconnection: ${error}`)
	}
}

async function connectToDiscord(): Promise<boolean> {
	try {
		discordStatusStore.set("connecting")
		const success = await window.api.discord.connect()

		if (success) {
			discordStatusStore.set("connected")
			logger.info("Connected to Discord")
		} else {
			discordStatusStore.set("error")
			logger.error("Failed to connect to Discord")
		}

		return success
	} catch (error) {
		discordStatusStore.set("error")
		logger.error(`Error connecting to Discord: ${error}`)
		return false
	}
}

async function startDiscordUpdateLoop(): Promise<boolean> {
	try {
		const success = await window.api.discord.startUpdateLoop()

		if (success) {
			logger.info("Discord presence update loop started")
		}

		return success
	} catch (error) {
		logger.error(`Error starting Discord update loop: ${error}`)
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
