import type { ContentType, MediaStatus } from "@shared/media/media.types"
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
}

export const mediaStore = atom<MediaState>(INITIAL_STATE)

/**
 * What the app last handed to Discord, as the main process reports it. Kept out
 * of `MediaState` because it is a reading of the other end of the mapping: it
 * survives VLC going away, which is one of the answers it has to carry.
 */
export const lastPresenceStore = atom<LastSentPresence>({ kind: "unknown" })

export function resetMediaStore(): void {
	mediaStore.set(INITIAL_STATE)
}
