import type { VideoAnalysis } from "@main/features/media"
import { describe, expect, it } from "vitest"
import { coverKey } from "./cover.key"

function video(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
	return {
		isVideo: true,
		isTvShow: false,
		isMovie: true,
		title: "Some Movie",
		...overrides,
	}
}

describe("coverKey", () => {
	it("keys audio by artist and album, not by title", () => {
		const trackThree = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", album: "Ahora", title: "Probablemente" },
		})
		const trackFour = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", album: "Ahora", title: "Otra Cancion" },
		})

		expect(trackThree).toBe(trackFour)
	})

	it("changes audio's key when the album changes, same artist", () => {
		const albumOne = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", album: "Ahora" },
		})
		const albumTwo = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", album: "Forajido" },
		})

		expect(albumOne).not.toBe(albumTwo)
	})

	it("falls back to artist and title when audio has no album", () => {
		const withAlbum = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", album: "Ahora" },
		})
		const withoutAlbum = coverKey({
			mediaType: "audio",
			media: { artist: "Christian Nodal", title: "Probablemente" },
		})

		expect(withAlbum).not.toBe(withoutAlbum)
	})

	it("keys a tv show by title and season, not by episode", () => {
		const episodeThree = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: true, isMovie: false, title: "Some Show", season: 1, episode: 3 }),
		})
		const episodeFour = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: true, isMovie: false, title: "Some Show", season: 1, episode: 4 }),
		})

		expect(episodeThree).toBe(episodeFour)
	})

	it("changes a tv show's key across seasons", () => {
		const seasonOne = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: true, isMovie: false, title: "Some Show", season: 1 }),
		})
		const seasonTwo = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: true, isMovie: false, title: "Some Show", season: 2 }),
		})

		expect(seasonOne).not.toBe(seasonTwo)
	})

	it("keys a movie by title and year", () => {
		const key = coverKey({
			mediaType: "video",
			media: {},
			video: video({ title: "Some Movie", year: "2019" }),
		})

		expect(key).toContain("Some Movie")
		expect(key).toContain("2019")
	})

	it("does not collide a tv show and a movie sharing a title", () => {
		const show = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: true, isMovie: false, title: "Twin Peaks", season: 1 }),
		})
		const movie = coverKey({
			mediaType: "video",
			media: {},
			video: video({ isTvShow: false, isMovie: true, title: "Twin Peaks", year: "2017" }),
		})

		expect(show).not.toBe(movie)
	})

	it("falls back to a bare video key when there is no video analysis", () => {
		expect(coverKey({ mediaType: "video", media: { title: "Unknown" } })).toBe("video:Unknown")
	})
})
