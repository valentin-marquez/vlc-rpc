import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mockApiKey } = vi.hoisted(() => ({ mockApiKey: { value: "test-key" } }))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => (key === "tmdbApiKey" ? mockApiKey.value : undefined),
	},
}))

import { TmdbProvider } from "./catalog.tmdb"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(tv: string, movie: string): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => ({
			ok: true,
			json: async () => JSON.parse(url.includes("/search/tv") ? tv : movie),
		})),
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
	mockApiKey.value = "test-key"
})

describe("TmdbProvider", () => {
	it("returns an empty list when no api key is configured", async () => {
		mockApiKey.value = ""
		const fetchSpy = vi.fn()
		vi.stubGlobal("fetch", fetchSpy)

		const provider = new TmdbProvider()
		const results = await provider.search("Game of Thrones")

		expect(results).toEqual([])
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("normalizes tv and movie results from both search endpoints", async () => {
		respondWith(fixture("tmdb-search-tv-response"), fixture("tmdb-search-movie-response"))

		const provider = new TmdbProvider()
		const results = await provider.search("Game of Thrones")

		const tv = results.find((r) => r.mediaKind === "tv")
		expect(tv).toEqual({
			provider: "tmdb",
			id: "1399",
			title: "Game of Thrones",
			aliases: [],
			year: 2011,
			mediaKind: "tv",
			posterUrl: "https://image.tmdb.org/t/p/w500/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg",
		})

		const movie = results.find((r) => r.mediaKind === "movie")
		expect(movie).toEqual({
			provider: "tmdb",
			id: "603",
			title: "The Matrix",
			aliases: [],
			year: 1999,
			mediaKind: "movie",
			posterUrl: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
		})
	})

	it("keeps the original name as an alias when it differs from the localized one", async () => {
		respondWith(fixture("tmdb-search-tv-response"), fixture("tmdb-no-results-response"))

		const provider = new TmdbProvider()
		const results = await provider.search("Money Heist")
		const moneyHeist = results.find((r) => r.id === "71446")

		expect(moneyHeist?.title).toBe("Money Heist")
		expect(moneyHeist?.aliases).toEqual(["La Casa de Papel"])
	})

	it("returns an empty list when a search fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false })),
		)

		const provider = new TmdbProvider()
		const results = await provider.search("anything")

		expect(results).toEqual([])
	})
})
