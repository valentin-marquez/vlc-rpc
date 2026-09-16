import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { ITunesProvider } from "./music.itunes"
import type { TrackQuery } from "./music.types"

const QUERY: TrackQuery = { artists: ["Christian Nodal"], title: "Probablemente" }

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

describe("ITunesProvider", () => {
	it("asks for songs only, with the artists and the title in the term", async () => {
		respondWith(fixture("itunes-no-results-response"))

		await new ITunesProvider().search(QUERY)

		expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
			"https://itunes.apple.com/search?term=Christian+Nodal+Probablemente&entity=song&limit=5",
		)
	})

	it("normalizes a solo result with the collection as its single release", async () => {
		respondWith(fixture("itunes-search-response"))

		const results = await new ITunesProvider().search(QUERY)

		expect(results[0]).toEqual({
			provider: "itunes",
			id: "1440902743",
			title: "Probablemente",
			artists: ["Christian Nodal"],
			releases: [
				{
					title: "Me Dejé Llevar",
					date: "2017-07-07T12:00:00Z",
					coverUrl:
						"https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ca/70/a4/ca70a457-5d72-0e11-87a8-fb8dba93e204/17UM1IM16287.rgb.jpg/600x600bb.jpg",
				},
			],
			rank: 0,
		})
	})

	it("moves the collaboration suffix out of the title and into artists", async () => {
		respondWith(fixture("itunes-search-response"))

		const results = await new ITunesProvider().search(QUERY)

		expect(results[1]?.title).toBe("Probablemente")
		expect(results[1]?.artists).toEqual(["Christian Nodal", "David Bisbal"])
	})

	it("rewrites only the final size segment of the artwork URL", async () => {
		respondWith(fixture("itunes-search-response"))

		const results = await new ITunesProvider().search(QUERY)

		expect(results[2]?.releases[0]?.coverUrl).toBe(
			"https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/1e/a3/ba/1ea3bafa-fd0c-65ec-6bde-7c7a7f4a2475/17UMGIM97878.rgb.jpg/600x600bb.jpg",
		)
	})

	it("ranks candidates by the order iTunes returned them", async () => {
		respondWith(fixture("itunes-search-response"))

		const results = await new ITunesProvider().search(QUERY)

		expect(results.slice(0, 3).map((candidate) => candidate.rank)).toEqual([0, 1, 2])
	})

	it("returns an empty list when resultCount is zero, which is an answer and not a failure", async () => {
		respondWith(fixture("itunes-no-results-response"))

		const results = await new ITunesProvider().search({ artists: ["Nobody"], title: "Nothing" })

		expect(results).toEqual([])
	})

	it("rejects when the response is not ok, so the caller can tell it apart from zero results", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 503 })),
		)

		await expect(new ITunesProvider().search(QUERY)).rejects.toThrow("HTTP 503")
	})

	it("rejects when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down")
			}),
		)

		await expect(new ITunesProvider().search(QUERY)).rejects.toThrow("network down")
	})

	it("spaces out concurrent requests instead of firing them all at once", async () => {
		vi.useFakeTimers()
		respondWith(fixture("itunes-no-results-response"))

		const provider = new ITunesProvider()
		const all = Promise.all([
			provider.search(QUERY),
			provider.search(QUERY),
			provider.search(QUERY),
		])

		await vi.advanceTimersByTimeAsync(0)
		expect(vi.mocked(fetch).mock.calls.length).toBe(1)

		await vi.advanceTimersByTimeAsync(3000)
		expect(vi.mocked(fetch).mock.calls.length).toBe(2)

		await vi.advanceTimersByTimeAsync(3000)
		expect(vi.mocked(fetch).mock.calls.length).toBe(3)

		await all
	})
})
