import { vlcStatusStore } from "@renderer/features/vlc/vlc.store"
import { logger } from "@renderer/lib/utils"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { type InfoStamp, mergeVlcStatus, stampsAgree } from "./media.mapper"
import { correctionStore, lastPresenceStore, mediaStore } from "./media.store"

/**
 * Bumped by every correction the user writes. A read that was asked for under
 * an older count describes a file the app has since been told it got wrong.
 */
let corrections = 0

function stampNow(): InfoStamp {
	return { file: mediaStore.get().fileTitle, corrections }
}

export function updateFromVlcStatus(status: VlcStatus | null): void {
	mediaStore.set(mergeVlcStatus(mediaStore.get(), status))
}

export async function refreshMediaInfo(): Promise<void> {
	try {
		if (vlcStatusStore.get() !== "connected") {
			return
		}

		const asked = stampNow()
		const mediaInfo = await window.api.media.getMediaInfo()

		if (!stampsAgree(asked, stampNow())) {
			return
		}

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
				nameSource: null,
			})
			return
		}

		// Every field below falls back to what this same answer says the file is
		// called, never to what the screen already held. A removed correction
		// reports nothing in its place, and falling back to the screen would leave
		// the words the user just deleted sitting there until the file changed.
		const fileTitle = mediaInfo.media?.title || mediaStore.get().fileTitle

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
				fileTitle,
			// A correction on a file with no tags arrives here, the same way a catalog
			// title does above, so the screen shows what Discord is about to show.
			artist: mediaInfo.content_metadata?.artist || mediaInfo.media?.artist || null,
			fileTitle,
			mediaType: mediaInfo.mediaType || mediaStore.get().mediaType,
			season: mediaInfo.content_metadata?.season || null,
			episode: mediaInfo.content_metadata?.episode || null,
			year: mediaInfo.content_metadata?.year || null,
			// Written together or not at all by the handler, so an absent key means
			// the store would refuse this file rather than that nothing is playing.
			overrideKey: mediaInfo.override_key || null,
			overrideActive: mediaInfo.override_active === true,
			overrideBinding: mediaInfo.override_binding ?? null,
			nameSource: mediaInfo.content_name_source ?? null,
		})

		logger.info("Media information updated")
	} catch (error) {
		logger.error(`Error fetching media info: ${error}`)
	}
}

/**
 * Carry a correction the store has already accepted through to the screen.
 *
 * The write is done by the time this is called, so the panel says so at once
 * rather than at whatever point the two second poll next comes round. What
 * takes time is the answer the correction buys: the caches it shadows were
 * evicted, and for a file that carried no tags the corrected words go back out
 * to the catalogs to find the cover. That wait is the reason this reports
 * itself instead of running quietly.
 */
export async function applyCorrection(key: string, outcome: "saved" | "removed"): Promise<void> {
	corrections += 1

	const applying = { kind: "applying", key, outcome } as const
	correctionStore.set(applying)

	const current = mediaStore.get()
	if (current.overrideKey === key) {
		mediaStore.set({ ...current, overrideActive: outcome === "saved" })
	}

	try {
		await refreshMediaInfo()
	} finally {
		// Only the correction still being waited on settles: a second one saved
		// over the top of this one owns the row from that moment.
		if (correctionStore.get() === applying) {
			correctionStore.set({ kind: "settled" })
		}
	}
}

/**
 * The user's verdict on a name the app matched from the audio: refuse it, and
 * the file speaks for itself again, or take that refusal back.
 *
 * Both go through the correction store, because a refusal is a correction. It
 * is listed in Settings beside the ones the user typed and it is removed the
 * same way, which is the only reason it can be trusted to be temporary.
 */
export async function decideAudioMatch(
	key: string,
	sourceFilename: string,
	action: "refuse" | "restore",
): Promise<void> {
	try {
		if (action === "restore") {
			await window.api.overrides.remove(key)
		} else {
			const result = await window.api.overrides.save(key, { kind: "as-is", sourceFilename })
			if (!result.saved) {
				logger.error(`The store refused to file the decision: ${result.reason}`)
				return
			}
		}
	} catch (error) {
		logger.error(`Failed to file a decision about the audio match: ${error}`)
		return
	}

	await applyCorrection(key, action === "restore" ? "removed" : "saved")
}

/** Reported rather than rebuilt: Home reveals a mismatch, so it must not be able to invent one. */
export async function refreshLastPresence(): Promise<void> {
	try {
		lastPresenceStore.set(await window.api.discord.getLastPresence())
	} catch (error) {
		logger.error(`Error fetching the last presence: ${error}`)
	}
}

/** Through the main process, because the page's CSP blocks a remote image outright. */
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
