import { updateFromVlcStatus } from "@renderer/features/media/media.actions"
import { refreshMediaInfo } from "@renderer/features/media/media.actions"
import { logger } from "@renderer/lib/utils"
import type { VlcConfig } from "@shared/config/app-config"
import { vlcConfigStore, vlcErrorStore, vlcStatusStore } from "./vlc.store"

let statusPollingInterval: ReturnType<typeof setInterval> | null = null

export async function loadVlcConfig(): Promise<VlcConfig | null> {
	try {
		const config = await window.api.vlc.getConfig()
		vlcConfigStore.set(config)
		logger.info("VLC configuration loaded")

		await checkVlcConnection()
		return config
	} catch (error) {
		logger.error(`Failed to load VLC configuration: ${error}`)
		vlcErrorStore.set("Failed to load VLC configuration")
		return null
	}
}

export async function saveVlcConfig(config: VlcConfig): Promise<VlcConfig | null> {
	try {
		vlcStatusStore.set("connecting")
		const success = await window.api.vlc.setupConfig(config)

		if (success) {
			const updatedConfig = await window.api.vlc.getConfig()
			vlcConfigStore.set(updatedConfig)
			vlcStatusStore.set("connected")
			vlcErrorStore.set(null)
			logger.info("VLC configuration saved and connected")

			startStatusPolling()
			return updatedConfig
		}
		vlcStatusStore.set("error")
		vlcErrorStore.set("Failed to connect to VLC")
		logger.error("Failed to save VLC configuration")
		return null
	} catch (error) {
		vlcStatusStore.set("error")
		vlcErrorStore.set("An error occurred while saving VLC configuration")
		logger.error(`Error saving VLC configuration: ${error}`)
		return null
	}
}

export async function checkVlcConnection(): Promise<boolean> {
	try {
		const status = await window.api.vlc.checkStatus()

		if (status.isRunning) {
			vlcStatusStore.set("connected")
			vlcErrorStore.set(null)
			startStatusPolling()
			return true
		}
		vlcStatusStore.set("disconnected")
		vlcErrorStore.set(status.message)

		updateFromVlcStatus(null)

		return false
	} catch (error) {
		vlcStatusStore.set("error")
		vlcErrorStore.set("Failed to check VLC connection status")
		logger.error(`Error checking VLC connection: ${error}`)
		return false
	}
}

export function startStatusPolling(interval = 2000): void {
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
	}

	refreshVlcStatus()
	statusPollingInterval = setInterval(refreshVlcStatus, interval)
	logger.info(`VLC status polling started (${interval}ms)`)
}

export function stopStatusPolling(): void {
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
		statusPollingInterval = null
		logger.info("VLC status polling stopped")
	}
}

export async function refreshVlcStatus(): Promise<void> {
	if (vlcStatusStore.get() === "disconnected") {
		const isConnected = await checkVlcConnection()
		if (!isConnected) return
	}

	try {
		const status = await window.api.vlc.getStatus(true)

		if (status) {
			vlcStatusStore.set("connected")
			updateFromVlcStatus(status)
			await refreshMediaInfo()
		} else {
			await checkVlcConnection()
		}
	} catch (error) {
		logger.error(`Error refreshing VLC status: ${error}`)
		await checkVlcConnection()
	}
}

export async function initializeVlcStore(): Promise<void> {
	await loadVlcConfig()
	const isConnected = await checkVlcConnection()

	if (isConnected) {
		startStatusPolling()
	}
}
