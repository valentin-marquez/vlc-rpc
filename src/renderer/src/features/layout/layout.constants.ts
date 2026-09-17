import type { PresenceBadge } from "@renderer/components/presence-card"
import type { VideoFacts } from "@shared/presence/layout"
import type { BuilderSample } from "@shared/presence/layout-builder"

/**
 * A slot is named by where it sits on the card the user is looking at. Discord's own field
 * names never reach the screen.
 */
export interface SlotLabel {
	label: string
	/** Reads inside a sentence: "added to the <this>". */
	inSentence: string
}

/** A sample the canvas both draws and writes notes about, so it needs two spellings. */
export interface PreviewSample extends BuilderSample {
	inSentence: string
}

/** An arrangement is only ever on a profile while something plays, so every card says so. */
export const PLAYING_BADGE: PresenceBadge = { kind: "playing", text: "Playing" }

/** Stands in for the live track so the canvas stays readable before VLC reports one. */
export const SAMPLE_TRACK = {
	title: "Bohemian Rhapsody",
	artist: "Queen",
	album: "A Night at the Opera",
}

/**
 * The case the pieces exist for: a file whose tags say nothing, where every piece but one
 * has to take itself off the card rather than draw a word it has no value for.
 */
export const UNTAGGED_TRACK = { title: "track01", artist: "", album: "" }

/**
 * An arrangement only works if it reads for both, so the canvas shows an episode and a
 * film together rather than picking one.
 */
export const SAMPLE_EPISODE: VideoFacts = { title: "Breaking Bad", season: 2, episode: 5 }
export const SAMPLE_FILM: VideoFacts = { title: "The Matrix", year: 1999 }

export const MUSIC_SLOTS: readonly SlotLabel[] = [
	{ label: "Top line", inSentence: "top line" },
	{ label: "Middle line", inSentence: "middle line" },
	{ label: "Bottom line", inSentence: "bottom line" },
]

export const VIDEO_SLOTS: readonly SlotLabel[] = [
	{ label: "Top line", inSentence: "top line" },
	{ label: "Bottom line", inSentence: "bottom line" },
]
