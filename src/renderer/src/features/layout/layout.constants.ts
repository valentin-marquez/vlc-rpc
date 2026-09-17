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
	/** The header line runs on from the verb, the rest are lines of the body. */
	place: "header" | "body"
	/** What an empty slot says, when leaving it empty hands the line to Discord. */
	whenEmpty?: string
}

/** A sample the canvas both draws and writes notes about, so it needs two spellings. */
export interface PreviewSample extends BuilderSample {
	inSentence: string
	/**
	 * The file VLC has open right now, rather than one of the examples beside it. Only this
	 * card may draw the cover, the badge and the times of the presence that was sent.
	 */
	isLive: boolean
}

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
 *
 * The episode carries a year because the files people play do: a western release names
 * the show's year beside the episode marker. It draws no year, and seeing that happen is
 * the only way to know the arrangement does not write "S2E5 2009" onto a profile.
 */
export const SAMPLE_EPISODE: VideoFacts = {
	title: "Breaking Bad",
	season: 2,
	episode: 5,
	year: 2009,
}
export const SAMPLE_FILM: VideoFacts = { title: "The Matrix", year: 1999 }

/**
 * Four slots, because Discord draws four pieces of text for music and the first of them is
 * not a line of the card at all: it runs on from the verb, which is why the old name for it,
 * "Top line", sent the song to the header and left the artist in bold under it.
 */
export const MUSIC_SLOTS: readonly SlotLabel[] = [
	{
		label: "Header",
		inSentence: "header",
		place: "header",
		whenEmpty: "empty, so Discord writes the app's name here",
	},
	{ label: "Bold line", inSentence: "bold line", place: "body" },
	{ label: "Second line", inSentence: "second line", place: "body" },
	{ label: "Third line", inSentence: "third line", place: "body" },
]

/** Video has no header of its own to arrange, and no third line. See `VideoLayout`. */
export const VIDEO_SLOTS: readonly SlotLabel[] = [
	{ label: "Bold line", inSentence: "bold line", place: "body" },
	{ label: "Second line", inSentence: "second line", place: "body" },
]
