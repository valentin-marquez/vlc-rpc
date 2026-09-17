import { vlcStatusStore } from "@renderer/features/vlc/vlc.store"
import { logger } from "@renderer/lib/utils"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { lastPresenceStore, mediaStore, resetMediaStore } from "./media.store"

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
			fileTitle: null,
			mediaType: null,
			contentType: null,
			contentImageUrl: null,
			contentImageSourceUrl: null,
			season: null,
			episode: null,
			year: null,
			overrideKey: null,
			overrideActive: false,
			overrideBinding: null,
		})
		return
	}

	const { media, playback } = status
	const previous = mediaStore.get()
	const fileTitle = media.title || null

	// VLC's status arrives well before the enriched fields can be refetched, which
	// takes a catalog lookup and an image proxy round trip. Carrying the previous
	// file's fields across that gap would let "Edit correction" open a form keyed
	// to the file that just finished, and write the correction onto it.
	const stale =
		previous.fileTitle !== fileTitle
			? {
					contentType: null,
					contentImageUrl: null,
					contentImageSourceUrl: null,
					season: null,
					episode: null,
					year: null,
					overrideKey: null,
					overrideActive: false,
					overrideBinding: null,
				}
			: {}

	mediaStore.set({
		...previous,
		...stale,
		mediaStatus: status.status === "playing" ? "playing" : "paused",
		title: media.title || null,
		artist: media.artist || null,
		album: media.album || null,
		duration: playback.duration || null,
		position: playback.time || null,
		artwork: media.artworkUrl || null,
		fileTitle,
		mediaType: status.mediaType || null,
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
				contentImageSourceUrl: null,
				season: null,
				episode: null,
				year: null,
				overrideKey: null,
				overrideActive: false,
				overrideBinding: null,
			})
			return
		}

		mediaStore.set({
			...mediaStore.get(),
			contentType: mediaInfo.content_type || null,
			contentImageUrl: mediaInfo.content_image_url || null,
			contentImageSourceUrl: mediaInfo.content_image_source_url || null,
			title:
				mediaInfo.content_metadata?.clean_title ||
				mediaInfo.content_metadata?.title ||
				mediaInfo.content_metadata?.movie_name ||
				mediaInfo.content_metadata?.show_name ||
				mediaInfo.content_metadata?.anime_name ||
				mediaStore.get().title,
			// A correction on a file with no tags arrives here, the same way a catalog
			// title does above, so the screen shows what Discord is about to show.
			artist:
				mediaInfo.content_metadata?.artist || mediaInfo.media?.artist || mediaStore.get().artist,
			fileTitle: mediaInfo.media?.title || mediaStore.get().fileTitle,
			mediaType: mediaInfo.mediaType || mediaStore.get().mediaType,
			season: mediaInfo.content_metadata?.season || null,
			episode: mediaInfo.content_metadata?.episode || null,
			year: mediaInfo.content_metadata?.year || null,
			// Written together or not at all by the handler, so an absent key means
			// the store would refuse this file rather than that nothing is playing.
			overrideKey: mediaInfo.override_key || null,
			overrideActive: mediaInfo.override_active === true,
			overrideBinding: mediaInfo.override_binding ?? null,
		})

		logger.info("Media information updated")
	} catch (error) {
		logger.error(`Error fetching media info: ${error}`)
	}
}

/**
 * Read back the presence the main process last handed to Discord. Reported
 * rather than rebuilt here: Home exists to reveal a mismatch between VLC and
 * Discord, so it must not be able to invent one.
 */
export async function refreshLastPresence(): Promise<void> {
	try {
		lastPresenceStore.set(await window.api.discord.getLastPresence())
	} catch (error) {
		logger.error(`Error fetching the last presence: ${error}`)
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
