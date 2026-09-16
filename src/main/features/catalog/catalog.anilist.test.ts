import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { AniListProvider } from "./catalog.anilist"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: true, json: async () => JSON.parse(body) })),
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("AniListProvider", () => {
	it("normalizes a search result with romaji, english, native and synonyms as aliases", async () => {
		respondWith(fixture("anilist-search-response"))

		const provider = new AniListProvider()
		const results = await provider.search("Sora wa Akai Kawa no Hotori")

		expect(results).toEqual([
			{
				provider: "anilist",
				id: "207809",
				title: "Sora wa Akai Kawa no Hotori",
				aliases: ["Red River", "天は赤い河のほとり", "Anatolia Story"],
				year: 2026,
				mediaKind: "tv",
				posterUrl:
					"https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx207809-cpS7CAyjN7iP.jpg",
			},
		])
	})

	it("returns an empty list when there are no results", async () => {
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const results = await provider.search("zzxxqqnonexistentqueryxyz123")

		expect(results).toEqual([])
	})

	it("rejects when the response is not ok, so the caller can tell it apart from zero results", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 503 })),
		)

		const provider = new AniListProvider()
		await expect(provider.search("anything")).rejects.toThrow("HTTP 503")
	})

	it("rejects when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down")
			}),
		)

		const provider = new AniListProvider()
		await expect(provider.search("anything")).rejects.toThrow("network down")
	})

	it("waits at least 250ms between consecutive requests", async () => {
		vi.useFakeTimers()
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const first = provider.search("a")
		await vi.advanceTimersByTimeAsync(0)
		await first

		const second = provider.search("b")
		await vi.advanceTimersByTimeAsync(0)

		const fetchCallsBeforeWait = vi.mocked(fetch).mock.calls.length
		expect(fetchCallsBeforeWait).toBe(1)

		await vi.advanceTimersByTimeAsync(250)
		await second

		expect(vi.mocked(fetch).mock.calls.length).toBe(2)
	})

	it("spaces out concurrent requests instead of firing them all at once", async () => {
		vi.useFakeTimers()
		respondWith(fixture("anilist-no-results-response"))

		const provider = new AniListProvider()
		const all = Promise.all([provider.search("a"), provider.search("b"), provider.search("c")])

		await vi.advanceTimersByTimeAsync(0)
		expect(vi.mocked(fetch).mock.calls.length).toBe(1)

		await vi.advanceTimersByTimeAsync(250)
		expect(vi.mocked(fetch).mock.calls.length).toBe(2)

		await vi.advanceTimersByTimeAsync(250)
		expect(vi.mocked(fetch).mock.calls.length).toBe(3)

		await all
	})
})
