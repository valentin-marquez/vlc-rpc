import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("electron", () => ({
	app: { getVersion: () => "4.1.0" },
}))

import { MusicBrainzProvider } from "./music.musicbrainz"
import type { TrackQuery } from "./music.types"

const TRACK: TrackQuery = { artists: ["Christian Nodal"], title: "Probablemente" }

interface CapturedRequest {
	url: string
	headers: Record<string, string>
}

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string, status = 200): CapturedRequest[] {
	const requests: CapturedRequest[] = []
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
			return { ok: status < 400, status, json: async () => JSON.parse(body) }
		}),
	)
	return requests
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("MusicBrainzProvider", () => {
	it("queries with artist and title only, because adding the album empties the result", async () => {
		const requests = respondWith(fixture("musicbrainz-no-results-response"))

		const provider = new MusicBrainzProvider()
		await provider.search({ artists: ["Christian Nodal"], title: "Probablemente", album: "Ahora" })

		const query = new URL(requests[0]?.url ?? "").searchParams.get("query")
		expect(query).toBe('artist:"Christian Nodal" AND recording:"Probablemente"')
		expect(query).not.toContain("Ahora")
	})

	it("sends an identifying User-Agent with application, version and contact URL", async () => {
		const requests = respondWith(fixture("musicbrainz-no-results-response"))

		const provider = new MusicBrainzProvider()
		await provider.search(TRACK)

		expect(requests[0]?.headers["User-Agent"]).toBe(
			"vlc-rpc/4.1.0 ( https://github.com/Valentin-Marquez/vlc-rpc )",
		)
	})

	it("returns an empty list when the search reports count 0", async () => {
		respondWith(fixture("musicbrainz-no-results-response"))

		const provider = new MusicBrainzProvider()
		const results = await provider.search({
			artists: ["zzxxqqnonexistentartistxyz123"],
			title: "zzxxqqnonexistenttrackxyz123",
		})

		expect(results).toEqual([])
	})

	it("rejects on the 503 that carries the busy error body, instead of reporting zero results", async () => {
		respondWith(fixture("musicbrainz-busy-error"), 503)

		const provider = new MusicBrainzProvider()
		await expect(provider.search(TRACK)).rejects.toThrow("HTTP 503")
	})

	it("rejects on a 200 whose body carries an error key, since the status alone is not trustworthy", async () => {
		respondWith(fixture("musicbrainz-busy-error"))

		const provider = new MusicBrainzProvider()
		await expect(provider.search(TRACK)).rejects.toThrow("error in the response body")
	})

	it("rejects when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down")
			}),
		)

		const provider = new MusicBrainzProvider()
		await expect(provider.search(TRACK)).rejects.toThrow("network down")
	})

	it("carries the full artist credit, collaborators included, into artists", async () => {
		respondWith(fixture("musicbrainz-recording-search-response"))

		const provider = new MusicBrainzProvider()
		const results = await provider.search(TRACK)

		expect(results[0]?.artists).toEqual(["Christian Nodal"])
		expect(results[2]?.artists).toEqual(["Christian Nodal", "David Bisbal"])
	})

	it("keeps every release of a recording, not only the first", async () => {
		respondWith(fixture("musicbrainz-recording-search-response"))

		const provider = new MusicBrainzProvider()
		const results = await provider.search(TRACK)

		const top = results[0]
		expect(top?.releases).toHaveLength(6)
		// The first release of this recording is a compilation, so the edition the
		// resolver actually wants is reachable only if the whole list survives.
		expect(top?.releases[0]?.title).toBe("Lo mejor de dos grandes")
		expect(top?.releases.map((release) => release.title)).toContain("Probablemente")
		expect(top?.releases[4]).toEqual({
			id: "4192cac3-03f2-42af-b410-d4cedfa384a5",
			title: "Probablemente",
			date: "2017-07-07",
			releaseGroupId: "1a02a523-4d16-43e6-9c99-b56289d09cd7",
		})
	})

	it("normalizes the top recording with its id, title and release group ids", async () => {
		respondWith(fixture("musicbrainz-recording-search-response"))

		const provider = new MusicBrainzProvider()
		const results = await provider.search(TRACK)

		expect(results).toHaveLength(5)
		expect(results[0]?.provider).toBe("musicbrainz")
		expect(results[0]?.id).toBe("097cfb49-419c-4b00-97f3-cc86ef4d77c2")
		expect(results[0]?.title).toBe("Probablemente")
		expect(results[4]?.title).toBe("Probablemente (Detrás de cámaras)")
	})

	it("ranks by returned position, not by the score the service sends", async () => {
		respondWith(fixture("musicbrainz-recording-search-response"))

		const provider = new MusicBrainzProvider()
		const results = await provider.search(TRACK)

		// The fixture scores these 100, 100, 82, 82, 66, higher is better. Storing
		// that in rank, where lower is better, would invert every tie break.
		expect(results.map((candidate) => candidate.rank)).toEqual([0, 1, 2, 3, 4])
	})

	it("waits a second between consecutive requests", async () => {
		vi.useFakeTimers()
		respondWith(fixture("musicbrainz-no-results-response"))

		const provider = new MusicBrainzProvider()
		const first = provider.search(TRACK)
		await vi.advanceTimersByTimeAsync(0)
		await first

		const second = provider.search(TRACK)
		await vi.advanceTimersByTimeAsync(0)
		expect(vi.mocked(fetch).mock.calls.length).toBe(1)

		await vi.advanceTimersByTimeAsync(1000)
		await second
		expect(vi.mocked(fetch).mock.calls.length).toBe(2)
	})

	it("spaces out concurrent searches instead of firing them all at once", async () => {
		vi.useFakeTimers()
		respondWith(fixture("musicbrainz-no-results-response"))

		const provider = new MusicBrainzProvider()
		const all = Promise.all([
			provider.search(TRACK),
			provider.search(TRACK),
			provider.search(TRACK),
		])

		await vi.advanceTimersByTimeAsync(0)
		expect(vi.mocked(fetch).mock.calls.length).toBe(1)

		await vi.advanceTimersByTimeAsync(1000)
		expect(vi.mocked(fetch).mock.calls.length).toBe(2)

		await vi.advanceTimersByTimeAsync(1000)
		expect(vi.mocked(fetch).mock.calls.length).toBe(3)

		await all
	})
})
