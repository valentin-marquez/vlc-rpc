import { describe, expect, it } from "vitest"
import type { MusicPreset, VideoPreset } from "./layout"
import {
	MUSIC_PRESETS,
	VIDEO_PRESETS,
	applyTemplate,
	renderLine,
	resolveLayout,
	videoVariables,
} from "./layout"

const MUSIC_PRESET_NAMES: MusicPreset[] = ["default", "album-focused", "artist-spotlight"]
const VIDEO_PRESET_NAMES: VideoPreset[] = ["default", "one-line", "title-only"]

const FULL_TRACK = {
	title: "Bohemian Rhapsody",
	artist: "Queen",
	album: "A Night at the Opera",
}
const UNTAGGED_TRACK = { title: "track01", artist: "", album: "" }

const SERIES = videoVariables({ title: "Breaking Bad", season: 2, episode: 5 })
const FILM = videoVariables({ title: "The Matrix", year: 1999 })
const UNIDENTIFIED = videoVariables({ title: "holiday-clip" })

describe("applyTemplate", () => {
	it("substitutes every placeholder it is given a value for", () => {
		expect(applyTemplate("{title} by {artist}", { title: "Probablemente", artist: "Nodal" })).toBe(
			"Probablemente by Nodal",
		)
	})

	it("renders nothing when a variable is empty, so no literal outlives its value", () => {
		expect(applyTemplate("by {artist}", { artist: "" })).toBe("")
		expect(applyTemplate("by {artist}", { artist: undefined })).toBe("")
		expect(applyTemplate("by {artist}", { artist: "   " })).toBe("")
	})

	it("renders nothing when the template asks for a variable that was never supplied", () => {
		expect(applyTemplate("{title} ({year})", { title: "Probablemente" })).toBe("")
	})

	it("renders nothing rather than the word Unknown", () => {
		expect(applyTemplate("{missing}", {})).toBe("")
		expect(applyTemplate("Season {season}", { season: "" })).toBe("")
		expect(applyTemplate("S{season}E{episode}", { season: "", episode: "" })).toBe("")
		expect(applyTemplate("   ", {})).toBe("")
	})

	it("treats zero as a value, because a season can be numbered zero", () => {
		expect(applyTemplate("Season {season}", { season: 0 })).toBe("Season 0")
	})

	it("drops the line only when the missing variable is one it needs", () => {
		expect(applyTemplate("S{season}E{episode}", { season: 2, episode: undefined })).toBe("")
		expect(applyTemplate("S{season}E{episode}", { season: 2, episode: 5 })).toBe("S2E5")
	})

	it("keeps the separators the template author wrote", () => {
		expect(applyTemplate("- {a} - {b} -", { a: "x", b: "y" })).toBe("- x - y -")
	})

	it("collapses runs of whitespace", () => {
		expect(applyTemplate("{a}    {b}", { a: "x", b: "y" })).toBe("x y")
	})

	it("leaves a literal string with no placeholders untouched", () => {
		expect(applyTemplate("VLC", {})).toBe("VLC")
	})
})

describe("renderLine", () => {
	it("picks the first candidate whose variables all carry a value", () => {
		expect(renderLine(["S{season}E{episode}", "Season {season}", "{year}"], { season: 2 })).toBe(
			"Season 2",
		)
	})

	it("falls through to a literal candidate", () => {
		expect(renderLine(["{artist}", "VLC"], { artist: "" })).toBe("VLC")
	})

	it("renders nothing when no candidate fills and when the line is empty", () => {
		expect(renderLine(["{artist}", "by {artist}"], { artist: "" })).toBe("")
		expect(renderLine([], { artist: "Queen" })).toBe("")
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
})

describe("music presets", () => {
	it("lays out a fully tagged track", () => {
		const { music } = resolveLayout({ music: "default" })
		expect(renderLine(music.activityName, FULL_TRACK)).toBe("Queen")
		expect(renderLine(music.details, FULL_TRACK)).toBe("Bohemian Rhapsody")
		expect(renderLine(music.state, FULL_TRACK)).toBe("by Queen")
	})

	it("names the activity after the app when the file carries no artist", () => {
		const { music } = resolveLayout({ music: "default" })
		expect(renderLine(music.activityName, UNTAGGED_TRACK)).toBe("VLC")
		expect(renderLine(music.details, UNTAGGED_TRACK)).toBe("track01")
		expect(renderLine(music.state, UNTAGGED_TRACK)).toBe("")
	})

	it("puts the album first under album focus", () => {
		const { music } = resolveLayout({ music: "album-focused" })
		expect(renderLine(music.details, FULL_TRACK)).toBe("A Night at the Opera")
		expect(renderLine(music.state, FULL_TRACK)).toBe("Bohemian Rhapsody by Queen")
	})

	it("puts the artist first under artist spotlight", () => {
		const { music } = resolveLayout({ music: "artist-spotlight" })
		expect(renderLine(music.details, FULL_TRACK)).toBe("Queen")
		expect(renderLine(music.state, FULL_TRACK)).toBe("Bohemian Rhapsody")
	})

	it("never writes Unknown for a track with nothing but a file name", () => {
		for (const preset of MUSIC_PRESET_NAMES) {
			const { music } = resolveLayout({ music: preset })
			for (const line of [music.activityName, music.details, music.state]) {
				expect(renderLine(line, UNTAGGED_TRACK)).not.toContain("Unknown")
			}
		}
	})
})

describe("video presets", () => {
	it("shows the title with the episode below it by default", () => {
		const { video } = resolveLayout({ video: "default" })
		expect(renderLine(video.details, SERIES)).toBe("Breaking Bad")
		expect(renderLine(video.state, SERIES)).toBe("S2E5")
	})

	it("shows the title with the year below it by default, for a film", () => {
		const { video } = resolveLayout({ video: "default" })
		expect(renderLine(video.details, FILM)).toBe("The Matrix")
		expect(renderLine(video.state, FILM)).toBe("1999")
	})

	it("folds the episode into the title line under one line", () => {
		const { video } = resolveLayout({ video: "one-line" })
		expect(renderLine(video.details, SERIES)).toBe("Breaking Bad S2E5")
		expect(renderLine(video.state, SERIES)).toBe("")
	})

	it("folds the year into the title line under one line, for a film", () => {
		const { video } = resolveLayout({ video: "one-line" })
		expect(renderLine(video.details, FILM)).toBe("The Matrix (1999)")
		expect(renderLine(video.state, FILM)).toBe("")
	})

	it("shows the title alone under title only", () => {
		const { video } = resolveLayout({ video: "title-only" })
		expect(renderLine(video.details, SERIES)).toBe("Breaking Bad")
		expect(renderLine(video.state, SERIES)).toBe("")
		expect(renderLine(video.details, FILM)).toBe("The Matrix")
		expect(renderLine(video.state, FILM)).toBe("")
	})

	it("reads differently for a series than for a film under every preset", () => {
		for (const preset of VIDEO_PRESET_NAMES) {
			const { video } = resolveLayout({ video: preset })
			const series = [renderLine(video.details, SERIES), renderLine(video.state, SERIES)]
			const film = [renderLine(video.details, FILM), renderLine(video.state, FILM)]
			expect(series.join("|")).not.toBe(film.join("|"))
		}
	})

	it("never writes Unknown, or an orphaned bracket, for a file it could not identify", () => {
		for (const preset of VIDEO_PRESET_NAMES) {
			const { video } = resolveLayout({ video: preset })
			for (const line of [video.details, video.state]) {
				const rendered = renderLine(line, UNIDENTIFIED)
				expect(rendered).not.toContain("Unknown")
				expect(rendered).not.toContain("(")
				expect(rendered).not.toContain("{")
			}
		}
		expect(renderLine(VIDEO_PRESETS["one-line"].details, UNIDENTIFIED)).toBe("holiday-clip")
	})
})

describe("resolveLayout", () => {
	it("falls back to the default preset on each side", () => {
		expect(resolveLayout({})).toEqual({
			music: MUSIC_PRESETS.default,
			video: VIDEO_PRESETS.default,
		})
	})

	it("keeps the two choices independent", () => {
		const layout = resolveLayout({ music: "album-focused", video: "title-only" })
		expect(layout.music).toBe(MUSIC_PRESETS["album-focused"])
		expect(layout.video).toBe(VIDEO_PRESETS["title-only"])
	})

	it("falls back to the default for a preset name it does not know", () => {
		const layout = resolveLayout({ music: "nope" as MusicPreset, video: "nope" as VideoPreset })
		expect(layout.music).toBe(MUSIC_PRESETS.default)
		expect(layout.video).toBe(VIDEO_PRESETS.default)
	})
})
