import type { AppStatus, ConnectionStatus } from "@shared/types"
import type { MediaInfo, MediaStatus } from "@shared/types/media"
import { atom } from "nanostores"

export const appStatusStore = atom<AppStatus>("idle")
export const discordStatusStore = atom<ConnectionStatus>("disconnected")
export const mediaStatusStore = atom<MediaStatus>("stopped")
export const mediaInfoStore = atom<MediaInfo>({
	title: null,
	artist: null,
	album: null,
	duration: null,
	position: null,
	artwork: null,
})
export const errorStore = atom<string | null>(null)

/**
 * Update Discord connection status
 */
export async function updateDiscordStatus(): Promise<void> {
	try {
		const isConnected = await window.api.discord.getStatus()
		discordStatusStore.set(isConnected ? "connected" : "disconnected")
	} catch (error) {
		discordStatusStore.set("error")
	}
}

/**
 * Initialize app status
 */
export async function initializeAppStatus(): Promise<void> {
	appStatusStore.set("loading")

	try {
		await updateDiscordStatus()
		appStatusStore.set("ready")
	} catch (error) {
		appStatusStore.set("error")
		errorStore.set("Failed to initialize application")
	}
}
