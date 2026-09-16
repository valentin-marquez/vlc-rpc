import type { Override } from "@main/features/overrides"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import type { Cache } from "./music.cache"
import { audioOverrideKey, musicKey } from "./music.key"
import { type OverrideLookup, Resolver } from "./music.resolver"
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
	const calls = { get: 0, setResolved: 0, setUnresolved: 0, deleteWhere: 0 }
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
		deleteWhere: (matches: (key: string) => boolean) => {
			calls.deleteWhere++
			for (const key of [...store.keys()]) {
				if (matches(key)) store.delete(key)
			}
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

function fakeOverrides(entries: Record<string, Override> = {}) {
	const asked: string[] = []
	const overrides = {
		get: (key: string) => {
			asked.push(key)
			return entries[key] ?? null
		},
	}
	return { overrides, asked }
}

/** The store as it stands for a user who has never corrected anything. */
function noOverrides(): OverrideLookup {
	return fakeOverrides().overrides
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

const handPicked: Override = {
	kind: "audio",
	cover: "https://example.com/by-hand.jpg",
	sourceFilename: "01 Probablemente.mp3",
	savedAt: 0,
}
describe("Resolver.resolve", () => {
	it("returns null for non audio media without touching the cache or the providers", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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

	it("sends the artist tag to the providers whole, punctuation included", async () => {
		// Measured against the live iTunes API: split into "AC" and "DC" the
		// correct candidate is excluded at the identity gate, and the miss is
		// cached for a day. Same for "Simon & Garfunkel" and "Earth, Wind & Fire".
		const { cache } = fakeCache()
		const { provider: itunes, queries } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		await resolver.resolve(
			status({ title: "Back In Black", artist: "AC/DC", album: "Back In Black" }),
		)

		expect(queries[0]?.artists).toEqual(["AC/DC"])
	})

	it("moves the collaboration suffix off the query title and onto the credit", async () => {
		// The candidates arrive with the suffix already stripped, so a tag that
		// keeps it compares in a different shape: measured at 0.745 against the
		// 0.92 gate, which resolved this track to nothing for a day.
		const { cache } = fakeCache()
		const { provider: itunes, queries } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		await resolver.resolve(
			status({
				title: "Love the Way You Lie (feat. Rihanna)",
				artist: "Eminem",
				album: "Recovery",
			}),
		)

		expect(queries[0]?.title).toBe("Love the Way You Lie")
		expect(queries[0]?.artists).toEqual(["Eminem", "Rihanna"])
	})

	it("stops at iTunes when it resolves, leaving MusicBrainz alone", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(status(tagged))

		expect(mbCalls.search).toBe(1)
		expect(result?.provider).toBe("musicbrainz")
	})

	it("caches a search that only failed as a transient provider error", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([], true)
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		let cachedOnSettle: CacheEntry | null = null
		const key = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(status(tagged))

		expect(result?.cover).toBe("https://example.com/album.jpg")
		expect(asked).toEqual(["r2"])
	})

	it("prefers the release that fuzzily matches the album tag, the same rule the scorer used to pick this candidate", async () => {
		// The tag adds a "(Deluxe)" suffix a release title does not carry, the
		// exact shape that used to win the candidate in the scorer and then lose
		// the release pick in the resolver's stricter equality check.
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [
					{ id: "r1", title: "Grandes Éxitos", date: "2010-01-01" },
					{
						id: "r2",
						title: "Me Dejé Llevar (En Vivo Desde el Auditorio Nacional)",
						date: "2017-05-05",
					},
				],
			}),
		])
		const { source, asked } = fakeCoverSource({
			r1: "https://example.com/compilation.jpg",
			r2: "https://example.com/deluxe.jpg",
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(
			status({
				title: "Probablemente",
				artist: "Christian Nodal",
				album: "Me Dejé Llevar (En Vivo Desde el Auditorio Nacional) (Deluxe)",
			}),
		)

		expect(result?.cover).toBe("https://example.com/deluxe.jpg")
		expect(asked).toEqual(["r2"])
	})

	it("does not serve the album track's cover to the single, which the album tag chose", async () => {
		// Same recording, same credit, two album tags, two covers. One cache entry
		// for both would hand whichever resolved first to the other file.
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([
			candidate({
				releases: [
					{ id: "r1", title: "Me Dejé Llevar", coverUrl: "https://example.com/album.jpg" },
					{
						id: "r2",
						title: "Probablemente - Single",
						coverUrl: "https://example.com/single.jpg",
					},
				],
			}),
		])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const fromTheAlbum = await resolver.resolve(status(tagged))
		const fromTheSingle = await resolver.resolve(
			status({
				title: "Probablemente",
				artist: "Christian Nodal",
				album: "Probablemente - Single",
			}),
		)

		expect(fromTheAlbum?.cover).toBe("https://example.com/album.jpg")
		expect(fromTheSingle?.cover).toBe("https://example.com/single.jpg")
	})

	it("carries on to MusicBrainz when iTunes identifies the track and has no artwork", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([
			candidate({ releases: [{ title: "Me Dejé Llevar" }] }),
		])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [{ id: "r1", title: "Me Dejé Llevar" }],
			}),
		])
		const { source } = fakeCoverSource({ r1: "https://example.com/caa.jpg" })
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(status(tagged))

		expect(mbCalls.search).toBe(1)
		expect(result).toEqual({
			cover: "https://example.com/caa.jpg",
			provider: "musicbrainz",
			id: "mb-1",
		})
	})

	it("caches a no cover from the second provider even though the first one failed", async () => {
		// The archive answered that it holds no front image for a recording it
		// identified. That is a fact about the recording and keeps the long TTL:
		// a transient entry would ask both APIs again seconds later.
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [{ id: "r1", title: "Me Dejé Llevar" }],
			}),
		])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(status(tagged))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["no-cover"])
	})

	it("reports a provider error when the artwork lookup itself failed", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([
			candidate({
				provider: "musicbrainz",
				id: "mb-1",
				releases: [{ id: "r1", title: "Me Dejé Llevar" }],
			}),
		])
		const { source } = fakeCoverSource({}, true)
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())

		const result = await resolver.resolve(status(tagged))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["provider-error"])
	})

	it("serves a stored override without reading the cache or asking a provider", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked: coversAsked } = fakeCoverSource()
		const { overrides, asked } = fakeOverrides({
			"audio:christian nodal|me deje llevar": handPicked,
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides)

		const result = await resolver.resolve(status(tagged))

		expect(result?.cover).toBe("https://example.com/by-hand.jpg")
		// Not a catalog's name: the user is who answered, and the field says so.
		expect(result?.provider).toBe("override")
		expect(asked).toEqual(["audio:christian nodal|me deje llevar"])
		expect(cacheCalls.get).toBe(0)
		expect(cacheCalls.setResolved).toBe(0)
		expect(cacheCalls.setUnresolved).toBe(0)
		expect(itunesCalls.search).toBe(0)
		expect(mbCalls.search).toBe(0)
		expect(coversAsked).toEqual([])
	})

	it("applies one override to every track of the same album", async () => {
		// The whole reason this key is not `musicKey`, which carries the title:
		// under that one, correcting a twenty track record takes twenty
		// corrections.
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides({
			"audio:christian nodal|me deje llevar": handPicked,
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides)

		const first = await resolver.resolve(status(tagged))
		const second = await resolver.resolve(
			status({
				title: "De Los Besos Que Te Di",
				artist: "Christian Nodal",
				album: "Me Dejé Llevar",
			}),
		)

		expect(first?.cover).toBe("https://example.com/by-hand.jpg")
		expect(second?.cover).toBe("https://example.com/by-hand.jpg")
		expect(itunesCalls.search).toBe(0)
	})

	it("keys a file with no album tag by artist and title, so it can still be corrected", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides, asked } = fakeOverrides({
			"audio:christian nodal|probablemente": handPicked,
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides)

		const result = await resolver.resolve(
			status({ title: "Probablemente", artist: "Christian Nodal", album: "" }),
		)

		expect(asked).toEqual(["audio:christian nodal|probablemente"])
		expect(result?.cover).toBe("https://example.com/by-hand.jpg")
	})

	it("resolves as usual when the store holds no override for the track", async () => {
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides({ "audio:someone else|another record": handPicked })
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides)

		const result = await resolver.resolve(status(tagged))

		expect(result?.cover).toBe("https://example.com/itunes.jpg")
		expect(itunesCalls.search).toBe(1)
	})
})

describe("Resolver.evictOverride", () => {
	function evicting() {
		const { cache, store, calls } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides())
		return { resolver, cache, store, calls }
	}

	function cached(cache: Cache, query: TrackQuery, id: string): string {
		const key = musicKey(query)
		cache.setResolved(key, { cover: `https://example.com/${id}.jpg`, provider: "itunes", id })
		return key
	}

	const album = { artists: ["Christian Nodal"], title: "Probablemente", album: "Me Dejé Llevar" }

	it("drops every cached track of the album the override corrects", () => {
		const { resolver, cache, store } = evicting()
		const first = cached(cache, album, "1")
		const second = cached(
			cache,
			{ artists: ["Christian Nodal"], title: "De Los Besos Que Te Di", album: "Me Dejé Llevar" },
			"2",
		)

		resolver.evictOverride(audioOverrideKey(album))

		expect(store.has(first)).toBe(false)
		expect(store.has(second)).toBe(false)
	})

	it("leaves the same artist's other records alone", () => {
		const { resolver, cache, store } = evicting()
		const corrected = cached(cache, album, "1")
		const untouched = cached(
			cache,
			{ artists: ["Christian Nodal"], title: "Adiós Amor", album: "Ahora" },
			"2",
		)

		resolver.evictOverride(audioOverrideKey(album))

		expect(store.has(corrected)).toBe(false)
		expect(store.has(untouched)).toBe(true)
	})

	it("drops a track of the album credited to a guest as well", () => {
		// The cache key sorts the credit, so which name came from the artist tag is
		// gone by then. Membership is what is left to test, and evicting one track
		// too many costs a lookup while leaving one behind keeps the wrong cover.
		const { resolver, cache, store } = evicting()
		const duet = cached(
			cache,
			{
				artists: ["Christian Nodal", "David Bisbal"],
				title: "Probablemente",
				album: "Me Dejé Llevar",
			},
			"1",
		)

		resolver.evictOverride(audioOverrideKey(album))

		expect(store.has(duet)).toBe(false)
	})

	it("drops the track an override keyed by title corrects, when the file had no album tag", () => {
		const { resolver, cache, store } = evicting()
		const untagged = cached(cache, { artists: ["Christian Nodal"], title: "Probablemente" }, "1")
		const onTheAlbum = cached(cache, album, "2")

		resolver.evictOverride(
			audioOverrideKey({ artists: ["Christian Nodal"], title: "Probablemente" }),
		)

		expect(store.has(untagged)).toBe(false)
		// A file that does carry the album tag is a different override, and the one
		// being removed never applied to it.
		expect(store.has(onTheAlbum)).toBe(true)
	})

	it("ignores a video key, which no music entry can match", () => {
		const { resolver, cache, store } = evicting()
		const key = cached(cache, album, "1")

		resolver.evictOverride("tv:Red River|1")

		expect(store.has(key)).toBe(true)
	})
})
