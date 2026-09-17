import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { MediaState } from "./media.store"

/**
 * Everything that is worked out about a file rather than read off it: a catalog
 * title, an episode number, the cover, and where a correction for it is filed.
 * Cleared together, because they are all answers about one file and none of
 * them survives that file being swapped for another.
 */
const FORGOTTEN = {
	contentType: null,
	contentImageUrl: null,
	contentImageSourceUrl: null,
	season: null,
	episode: null,
	year: null,
	overrideKey: null,
	overrideActive: false,
	overrideBinding: null,
} as const

const NOTHING_PLAYING = {
	...FORGOTTEN,
	mediaStatus: "stopped",
	title: null,
	artist: null,
	album: null,
	duration: null,
	position: null,
	artwork: null,
	fileTitle: null,
	mediaType: null,
} as const

/**
 * What VLC reports, folded into what the screen already holds.
 *
 * The two writers of this store disagree about one field. VLC's status carries
 * the file's own name in `title`, while the enriched read carries the resolved
 * one, and the enriched read is a catalog lookup behind. Writing the raw name
 * on every poll therefore put the file name back on screen for as long as the
 * next lookup took, twice a second's worth of the panel rewriting itself. So
 * the raw name is written once, when the file actually changes, and is left
 * alone from then on.
 */
export function mergeVlcStatus(previous: MediaState, status: VlcStatus | null): MediaState {
	if (!status || !status.active || status.status === "stopped") {
		return { ...previous, ...NOTHING_PLAYING }
	}

	const { media, playback } = status
	const fileTitle = media.title || null

	const playing = {
		mediaStatus: status.status === "playing" ? ("playing" as const) : ("paused" as const),
		duration: playback.duration || null,
		position: playback.time || null,
		mediaType: status.mediaType || null,
		fileTitle,
	}

	if (previous.fileTitle === fileTitle) {
		// VLC owns these two alone, and it can attach cover art a beat after it
		// starts reporting the file, so a later answer adds and never takes away.
		return {
			...previous,
			...playing,
			album: media.album || previous.album,
			artwork: media.artworkUrl || previous.artwork,
		}
	}

	// A lookup for the file that just finished must not describe the one that
	// just started: `Edit correction` would open a form keyed to the wrong file
	// and write the correction onto it.
	return {
		...previous,
		...playing,
		...FORGOTTEN,
		title: media.title || null,
		artist: media.artist || null,
		album: media.album || null,
		artwork: media.artworkUrl || null,
	}
}

/**
 * The file a media info read was asked about, and the corrections in force when
 * it was asked. An answer is written only while both still hold.
 */
export interface InfoStamp {
	file: string | null
	corrections: number
}

/**
 * A catalog lookup can outlive its question. The file can change while it runs,
 * and a correction saved while it runs makes it an answer about the state the
 * user just left: writing either one would undo on screen what the user has
 * already been shown, which reads as the app changing its mind.
 */
export function stampsAgree(asked: InfoStamp, current: InfoStamp): boolean {
	return asked.file === current.file && asked.corrections === current.corrections
}
