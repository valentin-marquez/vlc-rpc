import { describe, expect, it } from "vitest"
import {
	DEFAULT_MUSIC_LAYOUT,
	DEFAULT_VIDEO_LAYOUT,
	fromMusicLines,
	fromVideoLines,
	musicChoiceFor,
	renderLine,
	resolveLayout,
	sameLines,
	textPiece,
	toMusicLines,
	toVideoLines,
	valuePiece,
	videoChoiceFor,
	videoVariables,
} from "./layout"

const FULL_TRACK = {
	title: "Bohemian Rhapsody",
	artist: "Queen",
	album: "A Night at the Opera",
}
const UNTAGGED_TRACK = { title: "track01", artist: "", album: "" }
const NO_ALBUM = { title: "Bohemian Rhapsody", artist: "Queen", album: "" }

const SERIES = videoVariables({ title: "Breaking Bad", season: 2, episode: 5 })
const FILM = videoVariables({ title: "The Matrix", year: 1999 })
const UNIDENTIFIED = videoVariables({ title: "holiday-clip" })
// The name of a western release routinely carries both, and the parser reads both:
// "Red River 2026 S01E11 Where My Heart Is 1080p CR WEB-DL AAC2.0 H.264-VARYG".
const DATED_SERIES = videoVariables({ title: "Red River", season: 1, episode: 11, year: 2026 })

describe("renderLine", () => {
	it("draws the pieces in the order they were placed", () => {
		expect(
			renderLine([valuePiece("title"), textPiece("by"), valuePiece("artist")], FULL_TRACK),
		).toBe("Bohemian Rhapsody by Queen")
	})

	it("takes a piece off the line when the file has nothing for it", () => {
		expect(renderLine([valuePiece("title"), valuePiece("album")], NO_ALBUM)).toBe(
			"Bohemian Rhapsody",
		)
		expect(renderLine([valuePiece("album")], NO_ALBUM)).toBe("")
	})

	it("takes the words with the value they were written for, so no literal outlives it", () => {
		expect(renderLine([textPiece("by"), valuePiece("artist")], { artist: "" })).toBe("")
		expect(renderLine([textPiece("by"), valuePiece("artist")], { artist: undefined })).toBe("")
		expect(renderLine([textPiece("by"), valuePiece("artist")], { artist: "   " })).toBe("")
	})

	it("drops the words that trail a value when that value is missing", () => {
		const line = [valuePiece("title"), textPiece("("), valuePiece("year"), textPiece(")")]
		expect(renderLine(line, FILM)).toBe("The Matrix (1999)")
		expect(renderLine(line, SERIES)).toBe("Breaking Bad")
	})

	it("keeps a bracket against the value it wraps, and a separator spaced", () => {
		expect(
			renderLine([valuePiece("title"), textPiece("-"), valuePiece("artist")], FULL_TRACK),
		).toBe("Bohemian Rhapsody - Queen")
		expect(renderLine([textPiece("("), valuePiece("year"), textPiece(")")], FILM)).toBe("(1999)")
	})

	it("draws words that have no value anywhere on the line", () => {
		expect(renderLine([textPiece("Listening to music")], {})).toBe("Listening to music")
	})

	it("never writes Unknown, and never an orphaned bracket", () => {
		const drawn = renderLine(
			[valuePiece("title"), textPiece("("), valuePiece("year"), textPiece(")")],
			UNIDENTIFIED,
		)
		expect(drawn).toBe("holiday-clip")
	})

	it("treats zero as a value, because a season can be numbered zero", () => {
		expect(renderLine([textPiece("Season"), valuePiece("season")], { season: 0 })).toBe("Season 0")
	})

	it("draws nothing for a line with no pieces at all", () => {
		expect(renderLine([], FULL_TRACK)).toBe("")
	})

	it("collapses runs of whitespace a typed piece brought with it", () => {
		expect(renderLine([textPiece("  by  "), valuePiece("artist")], FULL_TRACK)).toBe("by Queen")
	})
})

describe("videoVariables", () => {
	it("writes the episode marker the same way the presence loop used to", () => {
		expect(videoVariables({ title: "x", season: 2, episode: 5 }).episodeInfo).toBe("S2E5")
		expect(videoVariables({ title: "x", season: 2 }).episodeInfo).toBe("Season 2")
		expect(videoVariables({ title: "x", episode: 5 }).episodeInfo).toBe("Episode 5")
	})

	it("leaves the episode marker empty for a file with no season or episode", () => {
		expect(videoVariables({ title: "x" }).episodeInfo).toBe("")
	})

	it("has no year for a file it worked out to be an episode", () => {
		// The year in the name of a series file is the show's or the season's, not
		// this episode's, and beside "S1E11" it is noise either way.
		expect(DATED_SERIES.year).toBeUndefined()
		expect(videoVariables({ title: "x", season: 2, year: 2008 }).year).toBeUndefined()
		expect(videoVariables({ title: "x", year: 1999 }).year).toBe(1999)
	})
})

describe("the default arrangement", () => {
	it("never draws the same value on two lines", () => {
		const drawn = toMusicLines(DEFAULT_MUSIC_LAYOUT)
			.map((line) => renderLine(line, FULL_TRACK))
			.filter((line) => line !== "")
		expect(drawn).toHaveLength(3)
		expect(new Set(drawn).size).toBe(3)
	})

	it("leaves the header to Discord and draws the song in bold, the artist under it", () => {
		// The header runs on from the verb, so a song there reads "Listening to Bohemian
		// Rhapsody" with the artist in bold below, which is the song and the artist the
		// wrong way round. Left empty, Discord names the activity after the app itself.
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.activityName, FULL_TRACK)).toBe("")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.details, FULL_TRACK)).toBe("Bohemian Rhapsody")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.state, FULL_TRACK)).toBe("by Queen")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.largeText, FULL_TRACK)).toBe("A Night at the Opera")
	})

	it("draws the album once, on the line it was arranged onto", () => {
		// It used to be sent as the artwork text as well as drawn on a line, and Discord
		// draws both, so the same album was read twice off one card.
		const drawn = toMusicLines(DEFAULT_MUSIC_LAYOUT).map((line) => renderLine(line, FULL_TRACK))
		expect(drawn.filter((line) => line.includes("A Night at the Opera"))).toHaveLength(1)
	})

	it("keeps a track with no tags readable, and drops the lines it cannot fill", () => {
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.activityName, UNTAGGED_TRACK)).toBe("")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.details, UNTAGGED_TRACK)).toBe("track01")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.state, UNTAGGED_TRACK)).toBe("")
		expect(renderLine(DEFAULT_MUSIC_LAYOUT.largeText, UNTAGGED_TRACK)).toBe("")
	})

	it("draws the measured file the way a person reads it: song, then who sings it", () => {
		// The file the whole correction was measured against: identified by its sound, no
		// album anywhere in the tags.
		const nodal = { title: "Probablemente", artist: "Christian Nodal", album: "" }

		expect(toMusicLines(DEFAULT_MUSIC_LAYOUT).map((line) => renderLine(line, nodal))).toEqual([
			"",
			"Probablemente",
			"by Christian Nodal",
			"",
		])
	})

	it("reads differently for a series than for a film", () => {
		expect(toVideoLines(DEFAULT_VIDEO_LAYOUT).map((line) => renderLine(line, SERIES))).toEqual([
			"Breaking Bad",
			"S2E5",
		])
		expect(toVideoLines(DEFAULT_VIDEO_LAYOUT).map((line) => renderLine(line, FILM))).toEqual([
			"The Matrix",
			"1999",
		])
	})

	it("draws the episode alone for a series file whose name also carries a year", () => {
		expect(
			toVideoLines(DEFAULT_VIDEO_LAYOUT).map((line) => renderLine(line, DATED_SERIES)),
		).toEqual(["Red River", "S1E11"])
	})

	it("leaves nothing but the title for a video file it could not identify", () => {
		expect(
			toVideoLines(DEFAULT_VIDEO_LAYOUT).map((line) => renderLine(line, UNIDENTIFIED)),
		).toEqual(["holiday-clip", ""])
	})
})

describe("resolveLayout", () => {
	it("gives a config with no choice at all the default arrangement", () => {
		expect(resolveLayout({})).toEqual({ music: DEFAULT_MUSIC_LAYOUT, video: DEFAULT_VIDEO_LAYOUT })
	})

	it("reads a choice that names the default", () => {
		const layout = resolveLayout({ music: { kind: "default" }, video: { kind: "default" } })
		expect(layout.music).toEqual(DEFAULT_MUSIC_LAYOUT)
		expect(layout.video).toEqual(DEFAULT_VIDEO_LAYOUT)
	})

	it("reads pieces the user arranged", () => {
		const layout = resolveLayout({
			music: {
				kind: "custom",
				layout: {
					activityName: [valuePiece("album")],
					details: [valuePiece("title")],
					state: [valuePiece("artist")],
					largeText: [],
				},
			},
			video: {
				kind: "custom",
				layout: { details: [valuePiece("title")], state: [valuePiece("year")] },
			},
		})
		expect(renderLine(layout.music.activityName, FULL_TRACK)).toBe("A Night at the Opera")
		expect(renderLine(layout.video.state, FILM)).toBe("1999")
	})

	it("keeps the two choices independent", () => {
		const layout = resolveLayout({
			music: {
				kind: "custom",
				layout: { activityName: [valuePiece("album")], details: [], state: [], largeText: [] },
			},
			video: { kind: "default" },
		})
		expect(renderLine(layout.music.activityName, FULL_TRACK)).toBe("A Night at the Opera")
		expect(layout.video).toEqual(DEFAULT_VIDEO_LAYOUT)
	})

	it("falls back to the default for anything it does not recognize", () => {
		// A config is a file someone can open and mistype, and an unreadable layout must not
		// be the reason the app starts with no presence at all.
		for (const junk of ["album-focused", "", 7, null, true, { kind: "nope" }, []]) {
			const layout = resolveLayout({ music: junk as never, video: junk as never })
			expect(layout.music).toEqual(DEFAULT_MUSIC_LAYOUT)
			expect(layout.video).toEqual(DEFAULT_VIDEO_LAYOUT)
		}
	})

	it("drops junk a hand edited config put among the pieces", () => {
		const layout = resolveLayout({
			music: {
				kind: "custom",
				layout: {
					activityName: [
						valuePiece("title"),
						{ kind: "value", name: "" },
						7,
						null,
						{ kind: "nope" },
					],
					details: "nope",
					state: null,
				},
			} as never,
			video: { kind: "custom", layout: {} } as never,
		})
		expect(layout.music.activityName).toEqual([valuePiece("title")])
		expect(layout.music.details).toEqual([])
		expect(layout.music.state).toEqual([])
		expect(layout.music.largeText).toEqual([])
		expect(layout.video.details).toEqual([])
	})
})

describe("lines and layouts", () => {
	it("round trips a music layout through its ordered lines", () => {
		expect(fromMusicLines(toMusicLines(DEFAULT_MUSIC_LAYOUT))).toEqual(DEFAULT_MUSIC_LAYOUT)
	})

	it("round trips a video layout through its ordered lines", () => {
		expect(fromVideoLines(toVideoLines(DEFAULT_VIDEO_LAYOUT))).toEqual(DEFAULT_VIDEO_LAYOUT)
	})

	it("fills a missing line with nothing rather than reading past the end", () => {
		expect(fromMusicLines([[valuePiece("title")]])).toEqual({
			activityName: [valuePiece("title")],
			details: [],
			state: [],
			largeText: [],
		})
	})

	it("compares lines by their pieces in order", () => {
		expect(
			sameLines([[valuePiece("a"), textPiece("b")]], [[valuePiece("a"), textPiece("b")]]),
		).toBe(true)
		expect(
			sameLines([[valuePiece("a"), textPiece("b")]], [[textPiece("b"), valuePiece("a")]]),
		).toBe(false)
		expect(sameLines([[valuePiece("a")]], [[valuePiece("a")], []])).toBe(false)
	})
})

describe("choosing what to store", () => {
	it("stores a name while the pieces are still the shipped default", () => {
		expect(musicChoiceFor(DEFAULT_MUSIC_LAYOUT)).toEqual({ kind: "default" })
		expect(videoChoiceFor(DEFAULT_VIDEO_LAYOUT)).toEqual({ kind: "default" })
	})

	it("stores the pieces themselves once one has been moved", () => {
		const edited = { ...DEFAULT_MUSIC_LAYOUT, details: [valuePiece("album")] }
		expect(musicChoiceFor(edited)).toEqual({ kind: "custom", layout: edited })
	})

	it("stores an arrangement of its own as pieces", () => {
		const own = { activityName: [valuePiece("album")], details: [], state: [], largeText: [] }
		expect(musicChoiceFor(own)).toEqual({ kind: "custom", layout: own })
	})
})
