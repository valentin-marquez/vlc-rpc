import { logger } from "@renderer/lib/utils"
import type { ContentType } from "@shared/types/media"
import { atom } from "nanostores"
import { vlcStatusStore } from "./vlc"

export const mediaStore = atom<{
	contentType: ContentType | null
	contentImageUrl: string | null
	title: string | null
	artist: string | null
	season: number | null
	episode: number | null
	year: string | null
}>({
	contentType: null,
	contentImageUrl: null,
	title: null,
	artist: null,
	season: null,
	episode: null,
	year: null,
})

// Fetch media information from the main process
export async function refreshMediaInfo(): Promise<void> {
	try {
		if (vlcStatusStore.get() !== "connected") {
			return
		}

		const mediaInfo = await window.api.media.getMediaInfo()

		if (!mediaInfo || !mediaInfo.active) {
			mediaStore.set({
				contentType: null,
				contentImageUrl: null,
				title: null,
				artist: null,
				season: null,
				episode: null,
				year: null,
			})
			return
		}

		mediaStore.set({
			contentType: mediaInfo.content_type || null,
			contentImageUrl: mediaInfo.content_image_url || null,
			title:
				mediaInfo.content_metadata?.clean_title ||
				mediaInfo.content_metadata?.title ||
				mediaInfo.content_metadata?.movie_name ||
				mediaInfo.content_metadata?.show_name ||
				mediaInfo.content_metadata?.anime_name ||
				null,
			artist: mediaInfo.media?.artist || null,
			season: mediaInfo.content_metadata?.season || null,
			episode: mediaInfo.content_metadata?.episode || null,
			year: mediaInfo.content_metadata?.year || null,
		})

		logger.info("Media information updated")
	} catch (error) {
		logger.error(`Error fetching media info: ${error}`)
	}
}

// Get image from proxy if needed
export async function getProxiedImage(url: string | null): Promise<string | null> {
	if (!url) return null

	// If it's already a data URL, no need to proxy
	if (url.startsWith("data:")) return url

	try {
		return await window.api.image.getAsDataUrl(url)
	} catch (error) {
		logger.error(`Error proxying image: ${error}`)
		return null
	}
}
