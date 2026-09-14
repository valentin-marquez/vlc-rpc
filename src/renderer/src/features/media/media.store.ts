import type { ContentType, MediaStatus } from "@shared/media/media.types"
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
	// Enriched info (from media detection)
	contentType: ContentType | null
	contentImageUrl: string | null
	season: number | null
	episode: number | null
	year: string | null
}

const INITIAL_STATE: MediaState = {
	mediaStatus: "stopped",
	title: null,
	artist: null,
	album: null,
	duration: null,
	position: null,
	artwork: null,
	contentType: null,
	contentImageUrl: null,
	season: null,
	episode: null,
	year: null,
}

export const mediaStore = atom<MediaState>(INITIAL_STATE)

export function resetMediaStore(): void {
	mediaStore.set(INITIAL_STATE)
}
