import type { AppStatus, ConnectionStatus } from "@shared/types"
import type { MediaInfo, MediaStatus } from "@shared/types/media"
import { atom } from "nanostores"

// Store for app status
export const appStatusStore = atom<AppStatus>("idle")

// Store for Discord connection status
export const discordStatusStore = atom<ConnectionStatus>("disconnected")

// Store for media playback status
export const mediaStatusStore = atom<MediaStatus>("stopped")

// Store for current media info
export const mediaInfoStore = atom<MediaInfo>({
	title: null,
	artist: null,
	album: null,
	duration: null,
	position: null,
	artwork: null,
})

// Store for app error messages
export const errorStore = atom<string | null>(null)

// Update Discord connection status
export async function updateDiscordStatus(): Promise<void> {
	try {
		const isConnected = await window.api.discord.getStatus()
		discordStatusStore.set(isConnected ? "connected" : "disconnected")
	} catch (error) {
		discordStatusStore.set("error")
	}
}

// Initialize app status
export async function initializeAppStatus(): Promise<void> {
	appStatusStore.set("loading")

	try {
		// Check Discord connection status
		await updateDiscordStatus()

		// Set app as ready
		appStatusStore.set("ready")
	} catch (error) {
		appStatusStore.set("error")
		errorStore.set("Failed to initialize application")
	}
}
