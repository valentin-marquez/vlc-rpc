import { vlcStatusStore } from "@renderer/features/vlc/vlc.store"
import { logger } from "@renderer/lib/utils"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { mediaStore, resetMediaStore } from "./media.store"

/**
 * Update media store from VLC status response.
 * Called by VLC polling when a new status arrives.
 */
export function updateFromVlcStatus(status: VlcStatus | null): void {
	if (!status || !status.active || status.status === "stopped") {
		mediaStore.set({
			...mediaStore.get(),
			mediaStatus: "stopped",
			title: null,
			artist: null,
			album: null,
			duration: null,
			position: null,
			artwork: null,
		})
		return
	}

	const { media, playback } = status
	mediaStore.set({
		...mediaStore.get(),
		mediaStatus: status.status === "playing" ? "playing" : "paused",
		title: media.title || null,
		artist: media.artist || null,
		album: media.album || null,
		duration: playback.duration || null,
		position: playback.time || null,
		artwork: media.artworkUrl || null,
	})
}

/**
 * Fetch enriched media info (content type, season/episode, cover art URL)
 * from the main process and merge into the unified store.
 */
export async function refreshMediaInfo(): Promise<void> {
	try {
		if (vlcStatusStore.get() !== "connected") {
			return
		}

		const mediaInfo = await window.api.media.getMediaInfo()

		if (!mediaInfo || !mediaInfo.active) {
			mediaStore.set({
				...mediaStore.get(),
				contentType: null,
				contentImageUrl: null,
				season: null,
				episode: null,
				year: null,
			})
			return
		}

		mediaStore.set({
			...mediaStore.get(),
			contentType: mediaInfo.content_type || null,
			contentImageUrl: mediaInfo.content_image_url || null,
			title:
				mediaInfo.content_metadata?.clean_title ||
				mediaInfo.content_metadata?.title ||
				mediaInfo.content_metadata?.movie_name ||
				mediaInfo.content_metadata?.show_name ||
				mediaInfo.content_metadata?.anime_name ||
				mediaStore.get().title,
			artist: mediaInfo.media?.artist || mediaStore.get().artist,
			season: mediaInfo.content_metadata?.season || null,
			episode: mediaInfo.content_metadata?.episode || null,
			year: mediaInfo.content_metadata?.year || null,
		})

		logger.info("Media information updated")
	} catch (error) {
		logger.error(`Error fetching media info: ${error}`)
	}
}

/**
 * Proxy an image URL through the main process to get a data URL.
 * Avoids CORS issues with external artwork URLs.
 */
export async function getProxiedImage(url: string | null): Promise<string | null> {
	if (!url) return null
	if (url.startsWith("data:")) return url

	try {
		return await window.api.image.getAsDataUrl(url)
	} catch (error) {
		logger.error(`Error proxying image: ${error}`)
		return null
	}
}

export { resetMediaStore }
