import { logger } from "@renderer/lib/utils"
import type { ContentType } from "@shared/types/media"
import { atom } from "nanostores"
import { vlcStatusStore } from "./vlc"

export const enhancedMediaStore = atom<{
	contentType: ContentType | null
	contentImageUrl: string | null
	enhancedTitle: string | null
	enhancedArtist: string | null
	season: number | null
	episode: number | null
	year: string | null
}>({
	contentType: null,
	contentImageUrl: null,
	enhancedTitle: null,
	enhancedArtist: null,
	season: null,
	episode: null,
	year: null,
})

// Fetch enhanced media information from the main process
export async function refreshEnhancedMediaInfo(): Promise<void> {
	try {
		if (vlcStatusStore.get() !== "connected") {
			return
		}

		const enhancedInfo = await window.api.media.getEnhancedInfo()

		if (!enhancedInfo || !enhancedInfo.active) {
			enhancedMediaStore.set({
				contentType: null,
				contentImageUrl: null,
				enhancedTitle: null,
				enhancedArtist: null,
				season: null,
				episode: null,
				year: null,
			})
			return
		}

		enhancedMediaStore.set({
			contentType: enhancedInfo.content_type || null,
			contentImageUrl: enhancedInfo.content_image_url || null,
			enhancedTitle:
				enhancedInfo.content_metadata?.clean_title ||
				enhancedInfo.content_metadata?.title ||
				enhancedInfo.content_metadata?.movie_name ||
				enhancedInfo.content_metadata?.show_name ||
				enhancedInfo.content_metadata?.anime_name ||
				null,
			enhancedArtist: enhancedInfo.media?.artist || null,
			season: enhancedInfo.content_metadata?.season || null,
			episode: enhancedInfo.content_metadata?.episode || null,
			year: enhancedInfo.content_metadata?.year || null,
		})

		logger.info("Enhanced media information updated")
	} catch (error) {
		logger.error(`Error fetching enhanced media info: ${error}`)
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
