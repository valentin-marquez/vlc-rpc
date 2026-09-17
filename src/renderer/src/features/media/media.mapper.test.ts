import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it } from "vitest"
import { mergeVlcStatus, stampsAgree } from "./media.mapper"
import type { MediaState } from "./media.store"

const EMPTY: MediaState = {
	mediaStatus: "stopped",
	title: null,
	artist: null,
	album: null,
	duration: null,
	position: null,
	artwork: null,
	fileTitle: null,
	mediaType: null,
	contentType: null,
	contentImageUrl: null,
	contentImageSourceUrl: null,
	season: null,
	episode: null,
	year: null,
	overrideKey: null,
	overrideActive: false,
	overrideBinding: null,
}

function playing(media: VlcStatus["media"], time = 10): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0.1, time, duration: 100, rate: 1 },
		mediaType: "video",
		media,
	}
}

/** The screen after one poll and the enriched read that follows it. */
function resolved(): MediaState {
	const first = mergeVlcStatus(EMPTY, playing({ title: "Frieren.S01E11.mkv" }))
	return {
		...first,
		title: "Sousou no Frieren",
		contentType: "anime",
		season: 1,
		episode: 11,
		overrideKey: "video:sousou no frieren",
		overrideBinding: "metadata",
		overrideActive: true,
	}
}

describe("mergeVlcStatus", () => {
	it("takes the file's own name for a file it has not seen before", () => {
		const state = mergeVlcStatus(EMPTY, playing({ title: "Frieren.S01E11.mkv", artist: "" }))

		expect(state.fileTitle).toBe("Frieren.S01E11.mkv")
		expect(state.title).toBe("Frieren.S01E11.mkv")
		expect(state.mediaStatus).toBe("playing")
	})

	it("leaves the resolved title alone while the same file goes on playing", () => {
		// The bug this closes: VLC reports the file name every two seconds, and
		// writing it put the file name back on screen until the next catalog read
		// answered, so the panel blinked between the two for as long as it played.
		const state = mergeVlcStatus(resolved(), playing({ title: "Frieren.S01E11.mkv" }, 12))

		expect(state.title).toBe("Sousou no Frieren")
		expect(state.position).toBe(12)
	})

	it("leaves a corrected artist alone, which the file itself does not carry", () => {
		const corrected: MediaState = {
			...mergeVlcStatus(EMPTY, playing({ title: "track01", artist: "" })),
			title: "Probablemente",
			artist: "Christian Nodal",
		}

		const state = mergeVlcStatus(corrected, playing({ title: "track01", artist: "" }, 14))

		expect(state.title).toBe("Probablemente")
		expect(state.artist).toBe("Christian Nodal")
	})

	it("takes cover art VLC attaches after it started reporting the file", () => {
		const state = mergeVlcStatus(
			resolved(),
			playing({ title: "Frieren.S01E11.mkv", artworkUrl: "file:///art.png" }),
		)

		expect(state.artwork).toBe("file:///art.png")
	})

	it("forgets what was worked out about the file that just finished", () => {
		const state = mergeVlcStatus(resolved(), playing({ title: "Frieren.S01E12.mkv" }))

		expect(state.title).toBe("Frieren.S01E12.mkv")
		expect(state.contentType).toBeNull()
		expect(state.episode).toBeNull()
		expect(state.overrideKey).toBeNull()
		expect(state.overrideActive).toBe(false)
	})

	it("clears everything when playback stops", () => {
		const state = mergeVlcStatus(resolved(), { ...playing({ title: "x" }), status: "stopped" })

		expect(state).toEqual(EMPTY)
	})

	it("clears everything when VLC reports nothing at all", () => {
		expect(mergeVlcStatus(resolved(), null)).toEqual(EMPTY)
	})

	it("reports a paused file as paused", () => {
		const state = mergeVlcStatus(EMPTY, { ...playing({ title: "a.mkv" }), status: "paused" })

		expect(state.mediaStatus).toBe("paused")
	})
})

describe("stampsAgree", () => {
	it("agrees while the file and the corrections have not moved", () => {
		expect(stampsAgree({ file: "a.mkv", corrections: 0 }, { file: "a.mkv", corrections: 0 })).toBe(
			true,
		)
	})

	it("refuses an answer about the file that was playing when it was asked for", () => {
		expect(stampsAgree({ file: "a.mkv", corrections: 0 }, { file: "b.mkv", corrections: 0 })).toBe(
			false,
		)
	})

	it("refuses an answer asked for before the correction was saved", () => {
		// The one that would undo the save on screen: it left before the store was
		// told, so it still reports the file as uncorrected.
		expect(stampsAgree({ file: "a.mkv", corrections: 0 }, { file: "a.mkv", corrections: 1 })).toBe(
			false,
		)
	})
})
