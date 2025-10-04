import { logger } from "@renderer/lib/utils"
import { mediaInfoStore, mediaStatusStore } from "@renderer/stores/app-status"
import { refreshMediaInfo } from "@renderer/stores/media"
import type { ConnectionStatus, VlcConfig } from "@shared/types"
import type { VlcStatus } from "@shared/types/vlc"
import { atom } from "nanostores"

export const vlcConfigStore = atom<VlcConfig | null>(null)
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")
export const vlcErrorStore = atom<string | null>(null)

let statusPollingInterval: NodeJS.Timeout | null = null

/**
 * Load VLC configuration from the main process
 */
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

/**
 * Save VLC configuration to the main process
 */
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

/**
 * Check VLC connection status
 */
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

/**
 * Start polling for VLC status updates
 */
export function startStatusPolling(interval = 2000): void {
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
	}

	refreshVlcStatus()
	statusPollingInterval = setInterval(refreshVlcStatus, interval)
	logger.info(`VLC status polling started (${interval}ms)`)
}

/**
 * Stop polling for status updates
 */
export function stopStatusPolling(): void {
	if (statusPollingInterval) {
		clearInterval(statusPollingInterval)
		statusPollingInterval = null
		logger.info("VLC status polling stopped")
	}
}

/**
 * Refresh VLC status and update related stores
 */
export async function refreshVlcStatus(): Promise<void> {
	if (vlcStatusStore.get() === "disconnected") {
		const isConnected = await checkVlcConnection()
		if (!isConnected) return
	}

	try {
		const status = await window.api.vlc.getStatus(true)

		if (status) {
			vlcStatusStore.set("connected")
			updateMediaInfo(status)
			await refreshMediaInfo()
		} else {
			await checkVlcConnection()
		}
	} catch (error) {
		logger.error(`Error refreshing VLC status: ${error}`)
		await checkVlcConnection()
	}
}

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

	mediaStatusStore.set(status.status === "playing" ? "playing" : "paused")

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

/**
 * Initialize the VLC store
 */
export async function initializeVlcStore(): Promise<void> {
	await loadVlcConfig()
	const isConnected = await checkVlcConnection()

	if (isConnected) {
		startStatusPolling()
	}
}
