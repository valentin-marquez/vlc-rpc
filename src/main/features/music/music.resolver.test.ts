import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import type { Cache } from "./music.cache"
import { musicKey } from "./music.key"
import { Resolver } from "./music.resolver"
import type {
	CacheEntry,
	CandidateRelease,
	CoverArtSource,
	MusicProvider,
	MusicResult,
	RecordingCandidate,
	TrackQuery,
	UnresolvedReason,
} from "./music.types"

function status(media: VlcStatus["media"], mediaType: VlcStatus["mediaType"] = "audio"): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0, time: 0, duration: 240, rate: 1 },
		mediaType,
		media,
	}
}

function fakeCache() {
	const store = new Map<string, CacheEntry>()
	const calls = { get: 0, setResolved: 0, setUnresolved: 0 }
	const unresolvedReasons: UnresolvedReason[] = []
	const cache = {
		get: (key: string) => {
			calls.get++
			return store.get(key) ?? null
		},
		setResolved: (key: string, result: MusicResult) => {
			calls.setResolved++
			store.set(key, { status: "resolved", version: 1, result, lastAccessedAt: 0 })
		},
		setUnresolved: (key: string, reason: UnresolvedReason) => {
			calls.setUnresolved++
			unresolvedReasons.push(reason)
			store.set(key, {
				status: "unresolved",
				version: 1,
				expiresAt: 999_999_999,
				lastAccessedAt: 0,
			})
		},
	}
	return { cache: cache as unknown as Cache, calls, unresolvedReasons, store }
}

function fakeProvider(
	results: RecordingCandidate[] | (() => Promise<RecordingCandidate[]>),
	fails = false,
) {
	const calls = { search: 0 }
	const queries: TrackQuery[] = []
	const provider: MusicProvider = {
		search: async (query) => {
			calls.search++
			queries.push(query)
			if (fails) throw new Error("provider down")
			return typeof results === "function" ? await results() : results
		},
	}
	return { provider, calls, queries }
}

/** Keyed by release id so a test can give one edition art and the next none. */
function fakeCoverSource(covers: Record<string, string> = {}, fails = false) {
	const asked: string[] = []
	const source: CoverArtSource = {
		coverFor: async (release: CandidateRelease) => {
			asked.push(release.id ?? release.title)
			if (fails) throw new Error("archive down")
			return covers[release.id ?? release.title] ?? null
		},
	}
	return { source, asked }
}

function candidate(overrides: Partial<RecordingCandidate> = {}): RecordingCandidate {
	return {
		provider: "itunes",
		id: "1",
		title: "Probablemente",
		artists: ["Christian Nodal"],
		releases: [{ title: "Me Dejé Llevar", coverUrl: "https://example.com/itunes.jpg" }],
		rank: 0,
		...overrides,
	}
}

const tagged: VlcStatus["media"] = {
	title: "Probablemente",
	artist: "Christian Nodal",
	album: "Me Dejé Llevar",
}

describe("Resolver.resolve", () => {
	it("returns null for non audio media without touching the cache or the providers", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		expect(await resolver.resolve(status(tagged, "video"))).toBeNull()
		expect(cacheCalls.get).toBe(0)
		expect(itunesCalls.search).toBe(0)
		expect(mbCalls.search).toBe(0)
		expect(asked).toEqual([])
	})

	it("does not search when the artist tag is empty", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status({ title: "Probablemente", artist: "", album: "" }))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags"])
		expect(itunesCalls.search).toBe(0)
		expect(mbCalls.search).toBe(0)
	})

	it("does not search when the title is the Unknown placeholder", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(
			status({ title: "Unknown", artist: "Christian Nodal", album: "" }),
		)

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags"])
		expect(itunesCalls.search).toBe(0)
	})

	it("does not search when the title is a filename with an audio extension", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(
			status({
				title: "Christian Nodal - Probablemente (Official Lyric Video).mp3",
				artist: "Christian Nodal",
				album: "",
			}),
		)

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags"])
		expect(itunesCalls.search).toBe(0)
	})

	it("splits a multi artist tag so both names reach the providers", async () => {
		const { cache } = fakeCache()
		const { provider: itunes, queries } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		await resolver.resolve(
			status({
				title: "Probablemente",
				artist: "Christian Nodal, David Bisbal",
				album: "Me Dejé Llevar",
			}),
		)

		expect(queries[0]?.artists).toEqual(["Christian Nodal", "David Bisbal"])
	})

	it("stops at iTunes when it resolves, leaving MusicBrainz alone", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(result).toEqual({
			cover: "https://example.com/itunes.jpg",
			provider: "itunes",
			id: "1",
		})
		expect(mbCalls.search).toBe(0)
		expect(asked).toEqual([])
	})

	it("tries MusicBrainz when iTunes has nothing", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [{ id: "r1", title: "Me Dejé Llevar" }],
			}),
		])
		const { source } = fakeCoverSource({ r1: "https://example.com/caa.jpg" })
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(mbCalls.search).toBe(1)
		expect(result).toEqual({
			cover: "https://example.com/caa.jpg",
			provider: "musicbrainz",
			id: "mb-1",
		})
	})

	it("tries MusicBrainz when iTunes throws", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [{ id: "r1", title: "Me Dejé Llevar" }],
			}),
		])
		const { source } = fakeCoverSource({ r1: "https://example.com/caa.jpg" })
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(mbCalls.search).toBe(1)
		expect(result?.provider).toBe("musicbrainz")
	})

	it("caches a search that only failed as a transient provider error", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([], true)
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["provider-error"])
	})

	it("dedupes two concurrent calls for the same key into a single search", async () => {
		const { cache } = fakeCache()
		let release: (value: RecordingCandidate[]) => void = () => {}
		const pending = new Promise<RecordingCandidate[]>((resolve) => {
			release = resolve
		})
		const { provider: itunes, calls: itunesCalls } = fakeProvider(() => pending)
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const first = resolver.resolve(status(tagged))
		const second = resolver.resolve(status(tagged))

		release([candidate()])
		const [firstResult, secondResult] = await Promise.all([first, second])

		expect(itunesCalls.search).toBe(1)
		expect(firstResult?.cover).toBe("https://example.com/itunes.jpg")
		expect(secondResult?.cover).toBe("https://example.com/itunes.jpg")
	})

	it("writes the cache before the resolve promise settles", async () => {
		const { cache, store } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		let cachedOnSettle: CacheEntry | null = null
		const key = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const result = await resolver.resolve(status(tagged)).then((value) => {
			cachedOnSettle = store.get(key) ?? null
			return value
		})

		expect(cachedOnSettle).toEqual({
			status: "resolved",
			version: 1,
			result,
			lastAccessedAt: 0,
		})
	})

	it("caches an identified track with no artwork as no cover, not as no match", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [
					{ id: "r1", title: "Me Dejé Llevar" },
					{ id: "r2", title: "Probablemente" },
				],
			}),
		])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["no-cover"])
		expect(asked).toEqual(["r1", "r2"])
	})

	it("falls to the next release when the first one has no artwork", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [
					{ id: "r1", title: "Probablemente" },
					{ id: "r2", title: "Me Dejé Llevar" },
				],
			}),
		])
		const { source, asked } = fakeCoverSource({ r2: "https://example.com/second.jpg" })
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(
			status({ title: "Probablemente", artist: "Christian Nodal", album: "" }),
		)

		expect(result?.cover).toBe("https://example.com/second.jpg")
		expect(asked).toEqual(["r1", "r2"])
	})

	it("prefers the release matching the album tag over an earlier one that does not", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [
					{ id: "r1", title: "Grandes Éxitos", date: "2010-01-01" },
					{ id: "r2", title: "Me Dejé Llevar", date: "2017-05-05" },
				],
			}),
		])
		const { source, asked } = fakeCoverSource({
			r1: "https://example.com/compilation.jpg",
			r2: "https://example.com/album.jpg",
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source)

		const result = await resolver.resolve(status(tagged))

		expect(result?.cover).toBe("https://example.com/album.jpg")
		expect(asked).toEqual(["r2"])
	})
})
