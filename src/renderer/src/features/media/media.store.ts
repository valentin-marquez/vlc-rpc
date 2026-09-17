import type { ContentType, DetectedMediaInfo, MediaStatus } from "@shared/media/media.types"
import type { LastSentPresence } from "@shared/presence/presence.types"
import { atom } from "nanostores"

export interface MediaState {
	// Playback status
	mediaStatus: MediaStatus
	// Basic info (from VLC status)
	title: string | null
	artist: string | null
	album: string | null
	duration: number | null
	position: number | null
	artwork: string | null
	/**
	 * The file title exactly as VLC reports it, kept apart from `title` because
	 * `title` becomes the resolved one as soon as the catalog answers. Home shows
	 * both so a wrong parse is visible, and a correction is filed against it.
	 */
	fileTitle: string | null
	mediaType: "video" | "audio" | null
	// Enriched info (from media detection)
	contentType: ContentType | null
	contentImageUrl: string | null
	/**
	 * Where the cover came from, kept apart from `contentImageUrl` because that one
	 * is usually a data URL by the time it crosses IPC. This is the address a
	 * correction can be prefilled with.
	 */
	contentImageSourceUrl: string | null
	season: number | null
	episode: number | null
	year: string | null
	/**
	 * Where a manual correction for what is playing would be filed. Null means the
	 * store would refuse this file, so the correction cannot be offered at all.
	 */
	overrideKey: string | null
	overrideActive: boolean
	/**
	 * What that key is bound to. `file` means the tags named nothing and the
	 * correction follows the file itself, which the form has to say out loud
	 * because it stops applying the day the file moves.
	 */
	overrideBinding: "metadata" | "file" | null
	/**
	 * Where the title and the artist above came from, when they did not come from
	 * the file. Null is the ordinary case, the file naming itself.
	 */
	nameSource: DetectedMediaInfo["content_name_source"] | null
}

const INITIAL_STATE: MediaState = {
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
	nameSource: null,
}

export const mediaStore = atom<MediaState>(INITIAL_STATE)

/**
 * What the app last handed to Discord, as the main process reports it. Kept out
 * of `MediaState` because it is a reading of the other end of the mapping: it
 * survives VLC going away, which is one of the answers it has to carry.
 */
export const lastPresenceStore = atom<LastSentPresence>({ kind: "unknown" })

/**
 * A correction that is written but not yet reflected. Saving one evicts what
 * the app had worked out and sends it back to the catalogs with the corrected
 * words, so for a file that carried no tags the wait is a real lookup and not a
 * courtesy: without this the screen sits on the old answer and says nothing.
 *
 * `outcome` is what the store now holds, so the panel can say so before the
 * lookup that follows has anything to add.
 */
export type CorrectionActivity =
	| { kind: "settled" }
	| { kind: "applying"; key: string; outcome: "saved" | "removed" }

export const correctionStore = atom<CorrectionActivity>({ kind: "settled" })

export function resetMediaStore(): void {
	mediaStore.set(INITIAL_STATE)
	correctionStore.set({ kind: "settled" })
}
