import type { VlcStatus } from "@shared/vlc/vlc.types"

export interface CoverKeyInput {
	media: VlcStatus["media"]
}

/**
 * Identity of what cover art should be showing for audio. Deliberately
 * coarser than presenceKey: advancing to the next track on the same album
 * does not change this.
 */
export function coverKey(input: CoverKeyInput): string {
	const artist = input.media.artist || "unknown"
	if (input.media.album) {
		return `audio:${artist}|${input.media.album}`
	}
	return `audio:${artist}|${input.media.title || "unknown"}`
}
