import type { VideoAnalysis } from "@main/features/media"
import type { VlcStatus } from "@shared/vlc/vlc.types"

export interface CoverKeyInput {
	mediaType: "video" | "audio"
	media: VlcStatus["media"]
	video?: VideoAnalysis
}

/**
 * Identity of what cover art should be showing. Deliberately coarser than
 * presenceKey: advancing to the next track on the same album, or the next
 * episode of the same show, does not change this. The cover only needs
 * re-resolving when the thing it represents actually changes.
 */
export function coverKey(input: CoverKeyInput): string {
	if (input.mediaType === "audio") {
		const artist = input.media.artist || "unknown"
		if (input.media.album) {
			return `audio:${artist}|${input.media.album}`
		}
		return `audio:${artist}|${input.media.title || "unknown"}`
	}

	const video = input.video
	if (!video) {
		return `video:${input.media.title || "unknown"}`
	}

	if (video.isTvShow) {
		return `tv:${video.title}|${video.season ?? "unknown"}`
	}

	if (video.year) {
		return `movie:${video.title}|${video.year}`
	}

	return `video:${video.title}`
}
