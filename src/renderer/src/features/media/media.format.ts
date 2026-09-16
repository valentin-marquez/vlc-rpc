import type { ContentType } from "@shared/media/media.types"

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
	tv_show: "TV show",
	movie: "Movie",
	anime: "Anime",
	video: "Video",
	audio: "Audio",
	music_video: "Music video",
	documentary: "Documentary",
	unknown: "Unknown",
}

/**
 * What the app worked the file out to be. Falls back to VLC's own coarse split
 * when nothing was detected, because "Video" is still truer than a blank row.
 */
export function contentTypeLabel(
	contentType: ContentType | null,
	mediaType: "video" | "audio" | null,
): string | null {
	if (contentType) {
		return CONTENT_TYPE_LABELS[contentType]
	}
	if (mediaType === "audio") {
		return "Audio"
	}
	if (mediaType === "video") {
		return "Video"
	}
	return null
}

export function formatDuration(seconds: number | null): string | null {
	if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
		return null
	}

	const total = Math.floor(seconds)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const rest = total % 60

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`
	}
	return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export function formatEpisode(season: number | null, episode: number | null): string | null {
	if (season !== null && episode !== null) {
		return `Season ${season}, episode ${episode}`
	}
	if (season !== null) {
		return `Season ${season}`
	}
	if (episode !== null) {
		return `Episode ${episode}`
	}
	return null
}
