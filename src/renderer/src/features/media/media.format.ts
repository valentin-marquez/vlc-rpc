import type { ContentType, DetectedMediaInfo } from "@shared/media/media.types"
import type { CorrectionActivity } from "./media.store"

/**
 * The row that declares an automatic match, and where possible the one thing it
 * offers to do about it. It exists for a single reason: the words on screen did
 * not come from the file, and a user who disagrees needs something to disagree
 * with.
 *
 * `declared` is that row with no button. It is what a file already carrying a
 * correction gets: refusing the match files a correction of its own, and there
 * is one correction per file, so the click would take away a cover the user
 * chose by hand. The form below the row is where that file is edited instead.
 */
export type MatchRow =
	| { kind: "declared"; value: string }
	| { kind: "decidable"; value: string; button: string; action: "refuse" | "restore" }

/**
 * Nothing at all for a name the user typed: the correction row already answers
 * for that one, and two rows about one decision read as two decisions.
 */
export function audioMatchRow(
	source: DetectedMediaInfo["content_name_source"] | null,
	correctionSaved: boolean,
): MatchRow | null {
	switch (source) {
		case "identification":
			return correctionSaved
				? { kind: "declared", value: "Matched from the audio" }
				: {
						kind: "decidable",
						value: "Matched from the audio",
						button: "Use what the file says",
						action: "refuse",
					}
		case "as-is":
			return {
				kind: "decidable",
				value: "Turned off for this file",
				button: "Use the match again",
				action: "restore",
			}
		default:
			return null
	}
}

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

/** Where a correction for what is playing is filed, and whether one is there. */
export interface CorrectionRow {
	key: string | null
	active: boolean
	binding: "metadata" | "file" | null
}

/**
 * The correction row, which has to answer two questions at once: what is on
 * file, and whether the app is still busy acting on it. A file binding is worth
 * saying out loud, it behaves differently from the usual one and Settings is
 * where the difference is explained in full.
 *
 * While a correction is being applied the row reports the work rather than the
 * result. Saving one throws away what the app had worked out and asks again, and
 * for audio that carried no tags that is a catalog search for the cover: seconds
 * in which the old answer is still on screen and nothing else would say why.
 */
export function correctionSummary(row: CorrectionRow, activity: CorrectionActivity): string {
	if (activity.kind === "applying" && activity.key === row.key) {
		return activity.outcome === "saved"
			? "Looking the file up again"
			: "Going back to what the app worked out"
	}

	if (!row.active) {
		return row.binding === "file" ? "Not set, held against this file" : "Not set"
	}
	return row.binding === "file" ? "Saved against this file" : "Saved for this file"
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
