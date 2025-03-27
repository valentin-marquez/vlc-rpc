import { logger } from "@renderer/lib/utils"
import { mediaInfoStore, mediaStatusStore } from "@renderer/stores/app-status"
import { refreshEnhancedMediaInfo } from "@renderer/stores/enhanced-media"
import type { ConnectionStatus, VlcConfig } from "@shared/types"
import type { VlcStatus } from "@shared/types/vlc"
import { atom } from "nanostores"

// Store for VLC configuration
export const vlcConfigStore = atom<VlcConfig | null>(null)

// Store for connection status
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")

// Error message if connection fails
export const vlcErrorStore = atom<string | null>(null)

// Track the polling interval
let statusPollingInterval: NodeJS.Timeout | null = null

// Load VLC configuration from the main process
export async function loadVlcConfig(): Promise<VlcConfig | null> {
	try {
		const config = await window.api.vlc.getConfig()
		vlcConfigStore.set(config)
		logger.info("VLC configuration loaded")

		// Check connection status immediately after loading config
		await checkVlcConnection()

		return config
	} catch (error) {
		logger.error(`Failed to load VLC configuration: ${error}`)
		vlcErrorStore.set("Failed to load VLC configuration")
		return null
	}
}

// Save VLC configuration to the main process
export async function saveVlcConfig(config: VlcConfig): Promise<VlcConfig | null> {
	try {
		vlcStatusStore.set("connecting")
		const success = await window.api.vlc.setupConfig(config)

		if (success) {
			// Reload the config to get any changes made by the backend (like generated passwords)
			const updatedConfig = await window.api.vlc.getConfig()
			vlcConfigStore.set(updatedConfig)
			vlcStatusStore.set("connected")
			vlcErrorStore.set(null)
			logger.info("VLC configuration saved and connected")

			// Start status polling after connecting
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

// Check VLC connection status
export async function checkVlcConnection(): Promise<boolean> {
	try {
		const status = await window.api.vlc.checkStatus()

		if (status.isRunning) {
			vlcStatusStore.set("connected")
			vlcErrorStore.set(null)

			// Start polling for status updates
			startStatusPolling()

			return true
		}
		vlcStatusStore.set("disconnected")
		vlcErrorStore.set(status.message)

		// Clear media info if VLC is disconnected
		mediaInfoStore.set({
			title: null,
			artist: null,
			album: null,
			duration: null,
			position: null,
			artwork: null,
		})
		mediaStatusStore.set("stopped")

		return false
	} catch (error) {
		vlcStatusStore.set("error")
		vlcErrorStore.set("Failed to check VLC connection status")
		logger.error(`Error checking VLC connection: ${error}`)
		return false
	}
}

// Start polling for VLC status updates
export function startStatusPolling(interval = 2000): void {
	// Clear any existing interval first
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
	}

	// Initial status check
	refreshVlcStatus()

	// Set up polling interval
	statusPollingInterval = setInterval(refreshVlcStatus, interval)
	logger.info(`VLC status polling started (${interval}ms)`)
}

// Stop polling for status updates
export function stopStatusPolling(): void {
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
		statusPollingInterval = null
		logger.info("VLC status polling stopped")
	}
}

// Refresh VLC status and update related stores
export async function refreshVlcStatus(): Promise<void> {
	if (vlcStatusStore.get() === "disconnected") {
		// First check if VLC is now connected
		const isConnected = await checkVlcConnection()
		if (!isConnected) return
	}

	try {
		const status = await window.api.vlc.getStatus(true)

		if (status) {
			// VLC is connected and returned status
			vlcStatusStore.set("connected")

			// Update media status
			updateMediaInfo(status)

			// Also fetch enhanced media information
			await refreshEnhancedMediaInfo()
		} else {
			// No status returned, maybe VLC was closed
			await checkVlcConnection()
		}
	} catch (error) {
		logger.error(`Error refreshing VLC status: ${error}`)
		// Don't set error state immediately, let checkVlcConnection handle it
		await checkVlcConnection()
	}
}

// Update media information based on VLC status
function updateMediaInfo(status: VlcStatus): void {
	if (!status.active || status.status === "stopped") {
		mediaStatusStore.set("stopped")
		mediaInfoStore.set({
			title: null,
			artist: null,
			album: null,
			duration: null,
			position: null,
			artwork: null,
		})
		return
	}

	// Update media status (playing/paused)
	mediaStatusStore.set(status.status === "playing" ? "playing" : "paused")

	// Update media info
	const { media, playback } = status
	mediaInfoStore.set({
		title: media.title || null,
		artist: media.artist || null,
		album: media.album || null,
		duration: playback.duration || null,
		position: playback.time || null,
		artwork: media.artworkUrl || null,
	})
}

// Initialize the VLC store
export async function initializeVlcStore(): Promise<void> {
	// Load configuration
	await loadVlcConfig()

	// Check connection status
	const isConnected = await checkVlcConnection()

	// Start polling if connected
	if (isConnected) {
		startStatusPolling()
	}
}
