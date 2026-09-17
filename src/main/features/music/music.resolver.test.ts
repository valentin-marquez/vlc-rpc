import type { Override } from "@main/features/overrides"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import type { Cache } from "./music.cache"
import { audioOverrideKey, fingerprintKey, musicKey } from "./music.key"
import { type OverrideLookup, Resolver } from "./music.resolver"
import type {
	AudioFileIdentity,
	AudioIdentifier,
	CacheEntry,
	CandidateRelease,
	CoverArtSource,
	FileLocator,
	IdentifyOutcome,
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
			store.set(key, { status: "resolved", version: 2, result, lastAccessedAt: 0 })
		},
		setUnresolved: (key: string, reason: UnresolvedReason) => {
			calls.setUnresolved++
			unresolvedReasons.push(reason)
			store.set(key, {
				status: "unresolved",
				version: 2,
				reason,
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

function fakeOverrides(entries: Record<string, Override> = {}, refused: readonly string[] = []) {
	const asked: string[] = []
	const overrides: OverrideLookup = {
		get: (key: string) => {
			asked.push(key)
			return entries[key] ?? null
		},
		// Which keys the store turns down is the store's rule and is tested there.
		// A test that cares names the key it expects to be turned down.
		accepts: (key: string) => !refused.includes(key),
	}
	return { overrides, asked }
}

/** The store as it stands for a user who has never corrected anything. */
function noOverrides(): OverrideLookup {
	return fakeOverrides().overrides
}

function fakeLocator(file: AudioFileIdentity | null) {
	const calls = { asked: 0 }
	const locator: FileLocator = {
		fileFor: async () => {
			calls.asked++
			return file
		},
	}
	return { locator, calls }
}

/** VLC playing something with no bytes on disk, a stream for instance. */
function noLocator(): FileLocator {
	return fakeLocator(null).locator
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

/** What iTunes answers for the measured file, once the correction names it. */
function arnero(): RecordingCandidate {
	return candidate({
		id: "2",
		title: "José Arnero",
		artists: ["El Baucha"],
		releases: [{ title: "Yo nací pa' cantar cueca", coverUrl: "https://example.com/itunes.jpg" }],
	})
}

/** A file with an empty ID3 tag, which is what the file key exists for. */
const RIPPED: AudioFileIdentity = {
	path: "C:\\Music\\Ripped\\track01.mp3",
	size: 5_242_880,
	modifiedAt: 1_726_500_000_000,
}
describe("Resolver.resolve", () => {
	it("returns null for non audio media without touching the cache or the providers", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([])
		const { provider: musicbrainz, calls: mbCalls } = fakeProvider([])
		const { source, asked } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

		const result = await resolver.resolve(status(tagged))

		expect(mbCalls.search).toBe(1)
		expect(result?.provider).toBe("musicbrainz")
	})

	it("caches a search that only failed as a transient provider error", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([], true)
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
			version: 2,
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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, noLocator())

		const result = await resolver.resolve(
			status({ title: "Probablemente", artist: "Christian Nodal", album: "" }),
		)

		expect(asked).toEqual(["audio:christian nodal|probablemente"])
		expect(result?.cover).toBe("https://example.com/by-hand.jpg")
	})

	it("serves a correction filed against the file, which is all an untagged file has", async () => {
		// Without this the fingerprint step is the last word on a file no text
		// search can reach, and a wrong identification there had no way out.
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides, asked } = fakeOverrides(
			{ "file:C:\\Music\\Ripped\\track01.mp3": handPicked },
			["audio:|probablemente"],
		)
		const { locator } = fakeLocator({
			path: "C:\\Music\\Ripped\\track01.mp3",
			size: 5_242_880,
			modifiedAt: 1_726_500_000_000,
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		const result = await resolver.resolve(status({ title: "Probablemente", album: "" }))

		expect(result).toEqual({
			cover: "https://example.com/by-hand.jpg",
			provider: "override",
			id: "file:C:\\Music\\Ripped\\track01.mp3",
		})
		expect(asked).toEqual(["file:C:\\Music\\Ripped\\track01.mp3"])
		expect(itunesCalls.search).toBe(0)
	})

	it("searches the catalogs with the tags the correction supplies", async () => {
		// The measured case: a file with an empty ID3 tag that AcoustID does not
		// know and iTunes has exactly. The artist and the title are two words the
		// user already knows, and typing them buys the cover for free.
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls, queries } = fakeProvider([arnero()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "José Arnero",
					artist: "El Baucha",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			["audio:|jose arnero"],
		)
		const { locator } = fakeLocator(RIPPED)
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		const result = await resolver.resolve(status({ title: "Jose Arnero", album: "" }))

		expect(itunesCalls.search).toBe(1)
		expect(queries[0]).toEqual({ artists: ["El Baucha"], title: "José Arnero", album: undefined })
		expect(result?.cover).toBe("https://example.com/itunes.jpg")
		expect(result?.provider).toBe("itunes")
	})

	it("prefers a cover the correction carries over anything a catalog would find", async () => {
		// A typed address is a stronger statement than a search result, and it is
		// the answer for a record no catalog holds.
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "José Arnero",
					artist: "El Baucha",
					cover: "https://example.com/by-hand.jpg",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			["audio:|jose arnero"],
		)
		const { locator } = fakeLocator(RIPPED)
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		const result = await resolver.resolve(status({ title: "Jose Arnero", album: "" }))

		expect(result?.cover).toBe("https://example.com/by-hand.jpg")
		expect(result?.provider).toBe("override")
		expect(itunesCalls.search).toBe(0)
	})

	it("caches what the corrected tags resolved under those tags, not under the file", async () => {
		// The corrected values are a real credit and a real title, so the entry is
		// worth sharing with any other file the user corrects the same way.
		const { cache, store } = fakeCache()
		const { provider: itunes } = fakeProvider([arnero()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "José Arnero",
					artist: "El Baucha",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			["audio:|jose arnero"],
		)
		const { locator } = fakeLocator(RIPPED)
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		await resolver.resolve(status({ title: "Jose Arnero", album: "" }))

		expect(store.has(musicKey({ artists: ["El Baucha"], title: "José Arnero" }))).toBe(true)
	})

	it("does not let one untagged file's correction reach another", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides({ "file:C:\\Music\\Ripped\\track01.mp3": handPicked }, [
			"audio:|unknown",
		])
		const { locator } = fakeLocator({
			path: "C:\\Music\\Other\\track01.mp3",
			size: 4_100_000,
			modifiedAt: 1_726_500_000_001,
		})
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		const result = await resolver.resolve(status({ title: "Unknown", artist: "", album: "" }))

		expect(result).toBeNull()
	})

	it("resolves as usual when the store holds no override for the track", async () => {
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides({ "audio:someone else|another record": handPicked })
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, noLocator())

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
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())
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

	it("leaves the cache alone for a correction filed against a file", () => {
		// What such a correction replaces is the fingerprint entry, which is a
		// function of the bytes: re-asking costs a request on the one budget every
		// user of this app shares, to be told the same thing.
		const { resolver, cache, store } = evicting()
		const key = cached(cache, album, "1")

		resolver.evictOverride("file:C:\\Music\\Ripped\\track01.mp3")

		expect(store.has(key)).toBe(true)
	})
})

describe("Resolver.overrideTargetFor", () => {
	const RIP: AudioFileIdentity = {
		path: "C:\\Music\\Ripped\\track01.mp3",
		size: 5_242_880,
		modifiedAt: 1_726_500_000_000,
	}

	function targeting(
		entries: Record<string, Override> = {},
		refused: readonly string[] = [],
		file: AudioFileIdentity | null = null,
	) {
		const { cache, calls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides(entries, refused)
		const { locator, calls: locatorCalls } = fakeLocator(file)
		return {
			resolver: new Resolver(cache, itunes, musicbrainz, source, overrides, locator),
			calls,
			itunesCalls,
			locatorCalls,
		}
	}

	it("names the record key without asking a provider or reading the cache", async () => {
		const { resolver, calls, itunesCalls } = targeting()

		expect(await resolver.overrideTargetFor(status(tagged))).toEqual({
			kind: "metadata",
			key: "audio:christian nodal|me deje llevar",
			active: false,
		})
		expect(itunesCalls.search).toBe(0)
		expect(calls.get).toBe(0)
	})

	it("names the same key every track of the record would be corrected under", async () => {
		const { resolver } = targeting()

		const other = status({
			title: "De Los Besos Que Te Di",
			artist: "Christian Nodal",
			album: "Me Dejé Llevar",
		})

		expect((await resolver.overrideTargetFor(other))?.key).toBe(
			"audio:christian nodal|me deje llevar",
		)
	})

	it("falls back to the title when the file carries no album tag", async () => {
		const { resolver } = targeting()

		const untagged = status({ title: "Probablemente", artist: "Christian Nodal", album: "" })

		expect((await resolver.overrideTargetFor(untagged))?.key).toBe(
			"audio:christian nodal|probablemente",
		)
	})

	it("reports a key an override is already saved under as active", async () => {
		const { resolver } = targeting({ "audio:christian nodal|me deje llevar": handPicked })

		expect(await resolver.overrideTargetFor(status(tagged))).toEqual({
			kind: "metadata",
			key: "audio:christian nodal|me deje llevar",
			active: true,
		})
	})

	it("does not ask which file is playing while the tags name the record", async () => {
		// The playlist is an http round trip. A file that says what it is has an
		// identity already, so nothing is gained by going to find another.
		const { resolver, locatorCalls } = targeting({}, [], RIP)

		await resolver.overrideTargetFor(status(tagged))

		expect(locatorCalls.asked).toBe(0)
	})

	it("files audio with no artist tag under the file itself, which the store does take", async () => {
		// The hole this closes: the credit leads the record key, so audio with no
		// artist tag produces a key the store refuses, and the one kind of file
		// most likely to be identified wrongly was the one kind nobody could fix.
		const { resolver } = targeting({}, ["audio:|probablemente"], RIP)

		const anonymous = status({ title: "Probablemente", album: "" })

		expect(await resolver.overrideTargetFor(anonymous)).toEqual({
			kind: "file",
			key: "file:C:\\Music\\Ripped\\track01.mp3",
			active: false,
		})
	})

	it("gives two untagged files two keys, which is the whole reason it is the file", async () => {
		const other: AudioFileIdentity = { ...RIP, path: "C:\\Music\\Other\\track01.mp3" }
		const first = targeting({}, ["audio:|unknown"], RIP)
		const second = targeting({}, ["audio:|unknown"], other)

		const untagged = status({ title: "Unknown", artist: "", album: "" })

		expect((await first.resolver.overrideTargetFor(untagged))?.key).not.toBe(
			(await second.resolver.overrideTargetFor(untagged))?.key,
		)
	})

	it("reports a correction already filed against the file as active", async () => {
		const { resolver } = targeting(
			{ "file:C:\\Music\\Ripped\\track01.mp3": handPicked },
			["audio:|probablemente"],
			RIP,
		)

		const anonymous = status({ title: "Probablemente", album: "" })

		expect(await resolver.overrideTargetFor(anonymous)).toEqual({
			kind: "file",
			key: "file:C:\\Music\\Ripped\\track01.mp3",
			active: true,
		})
	})

	it("reports a correction that supplied the tags as active, like one that picked a cover", async () => {
		// The shape a file with no tags is corrected under. Reported as absent, the
		// panel goes on saying "not set" over a correction the user just saved.
		const { resolver } = targeting(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "Probablemente",
					artist: "Christian Nodal",
					sourceFilename: "track01.mp3",
					savedAt: 0,
				},
			},
			["audio:|probablemente"],
			RIP,
		)

		const anonymous = status({ title: "Probablemente", album: "" })

		expect(await resolver.overrideTargetFor(anonymous)).toEqual({
			kind: "file",
			key: "file:C:\\Music\\Ripped\\track01.mp3",
			active: true,
		})
	})

	it("reports no key when the tags name nothing and neither does a file", async () => {
		// A stream has no bytes on disk, so there is no third identity to fall to
		// and no honest key left to offer.
		const { resolver } = targeting({}, ["audio:|probablemente"], null)

		const anonymous = status({ title: "Probablemente", album: "" })

		expect(await resolver.overrideTargetFor(anonymous)).toBeNull()
	})

	it("offers the file key on an install that carries no fingerprint binary", async () => {
		// The correction exists for the files the fingerprint step gets wrong, and
		// that step is absent on every clone built without a key. A correction gated
		// on the same optional binary would be missing wherever it is needed.
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides({}, ["audio:|probablemente"])
		const { locator } = fakeLocator(RIP)
		const resolver = new Resolver(cache, itunes, musicbrainz, source, overrides, locator)

		const anonymous = status({ title: "Probablemente", album: "" })

		expect((await resolver.overrideTargetFor(anonymous))?.key).toBe(
			"file:C:\\Music\\Ripped\\track01.mp3",
		)
	})

	it("reports no key for video, which the catalog keys its own way", async () => {
		const { resolver } = targeting()

		expect(await resolver.overrideTargetFor(status(tagged, "video"))).toBeNull()
	})
})

describe("Resolver.correctedTagsFor", () => {
	function asking(entries: Record<string, Override> = {}, refused: readonly string[] = []) {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides } = fakeOverrides(entries, refused)
		const { locator, calls } = fakeLocator(RIPPED)
		return {
			resolver: new Resolver(cache, itunes, musicbrainz, source, overrides, locator),
			locatorCalls: calls,
		}
	}

	it("hands back what the user typed, which is all the presence text has to read", async () => {
		const { resolver } = asking(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "José Arnero",
					artist: "El Baucha",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			["audio:|jose arnero"],
		)

		expect(await resolver.correctedTagsFor(status({ title: "Jose Arnero", album: "" }))).toEqual({
			title: "José Arnero",
			artist: "El Baucha",
		})
	})

	it("hands back nothing for a correction that only picked a cover", async () => {
		const { resolver } = asking(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					cover: "https://example.com/by-hand.jpg",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			["audio:|jose arnero"],
		)

		expect(await resolver.correctedTagsFor(status({ title: "Jose Arnero", album: "" }))).toBeNull()
	})

	it("hands back nothing for audio that carries its own tags", async () => {
		// The asymmetry the phase 4 spec documents still stands where it was
		// argued: a file that says what it is has a text already.
		const { resolver, locatorCalls } = asking({
			"audio:christian nodal|me deje llevar": handPicked,
		})

		expect(await resolver.correctedTagsFor(status(tagged))).toBeNull()
		expect(locatorCalls.asked).toBe(0)
	})

	it("hands back nothing for video", async () => {
		const { resolver } = asking()

		expect(await resolver.correctedTagsFor(status(tagged, "video"))).toBeNull()
	})
})

describe("Resolver.overrideCoverFor", () => {
	const RIP = RIPPED

	function looking(
		entries: Record<string, Override> = {},
		file: AudioFileIdentity | null = null,
		refused: readonly string[] = [],
	) {
		const { cache, calls } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { overrides, asked } = fakeOverrides(entries, refused)
		const { locator, calls: locatorCalls } = fakeLocator(file)
		return {
			resolver: new Resolver(cache, itunes, musicbrainz, source, overrides, locator),
			calls,
			itunesCalls,
			asked,
			locatorCalls,
		}
	}

	it("answers with the saved cover without asking a provider or reading the cache", async () => {
		const { resolver, calls, itunesCalls, asked } = looking({
			"audio:christian nodal|me deje llevar": handPicked,
		})

		expect(await resolver.overrideCoverFor(status(tagged))).toBe("https://example.com/by-hand.jpg")
		expect(asked).toEqual(["audio:christian nodal|me deje llevar"])
		expect(itunesCalls.search).toBe(0)
		expect(calls.get).toBe(0)
	})

	it("answers nothing when the record was never corrected", async () => {
		const { resolver, itunesCalls } = looking()

		expect(await resolver.overrideCoverFor(status(tagged))).toBeNull()
		expect(itunesCalls.search).toBe(0)
	})

	it("answers with the cover filed against the file when the tags name nothing", async () => {
		const { resolver } = looking({ "file:C:\\Music\\Ripped\\track01.mp3": handPicked }, RIP, [
			"audio:|probablemente",
		])

		const anonymous = status({ title: "Probablemente", album: "" })

		expect(await resolver.overrideCoverFor(anonymous)).toBe("https://example.com/by-hand.jpg")
	})

	it("answers nothing when the correction supplied tags and no cover", async () => {
		// This is asked ahead of the file's own artwork, and a correction that only
		// says what the file is has not claimed to know what it looks like. The
		// embedded art, then the lookup the tags now make possible, answer that.
		const { resolver } = looking(
			{
				"file:C:\\Music\\Ripped\\track01.mp3": {
					kind: "untagged-audio",
					title: "José Arnero",
					artist: "El Baucha",
					sourceFilename: "Jose Arnero.mp3",
					savedAt: 0,
				},
			},
			RIP,
			["audio:|jose arnero"],
		)

		expect(await resolver.overrideCoverFor(status({ title: "Jose Arnero", album: "" }))).toBeNull()
	})

	it("does not go looking for the file when the tags already name the record", async () => {
		// This runs for every audio track, ahead of the file's own artwork, so the
		// common case has to stay a local read.
		const { resolver, locatorCalls } = looking({}, RIP)

		await resolver.overrideCoverFor(status(tagged))

		expect(locatorCalls.asked).toBe(0)
	})

	it("answers nothing for video, whose corrections the catalog reads", async () => {
		const { resolver, asked } = looking({
			"audio:christian nodal|me deje llevar": handPicked,
		})

		expect(await resolver.overrideCoverFor(status(tagged, "video"))).toBeNull()
		expect(asked).toEqual([])
	})
})

describe("Resolver.resolve, by fingerprint", () => {
	const untagged: VlcStatus["media"] = { title: "Unknown", artist: "", album: "" }

	const FIRST_FILE: AudioFileIdentity = {
		path: "C:\\Music\\youtube-rip-01.mp3",
		size: 5_242_880,
		modifiedAt: 1_726_500_000_000,
	}
	const SECOND_FILE: AudioFileIdentity = {
		path: "C:\\Music\\youtube-rip-02.mp3",
		size: 4_100_000,
		modifiedAt: 1_726_500_000_001,
	}

	function recording(overrides: Partial<RecordingCandidate> = {}): RecordingCandidate {
		return {
			provider: "acoustid",
			id: "097cfb49-419c-4b00-97f3-cc86ef4d77c2",
			title: "Probablemente",
			artists: ["Christian Nodal"],
			releases: [{ title: "Me dejé llevar", releaseGroupId: "rg-1" }],
			rank: 0,
			...overrides,
		}
	}

	function fakeIdentifier(
		files: Record<number, AudioFileIdentity>,
		answer: (file: AudioFileIdentity) => IdentifyOutcome = () => ({
			kind: "identified",
			recording: recording(),
		}),
	) {
		const calls = { fileFor: 0, identify: 0 }
		const identified: string[] = []
		const identifier: AudioIdentifier = {
			fileFor: async (current: VlcStatus) => {
				calls.fileFor++
				return files[current.plid ?? -1] ?? null
			},
			identify: async (file: AudioFileIdentity) => {
				calls.identify++
				identified.push(file.path)
				return answer(file)
			},
		}
		return { identifier, calls, identified }
	}

	function playing(media: VlcStatus["media"], plid: number): VlcStatus {
		return { ...status(media), plid }
	}

	it("never runs when the tags already produced a cover", async () => {
		// The limit AcoustID enforces is per application key and shared by every
		// user, so this step only ever sees what nothing cheaper could identify.
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		const result = await resolver.resolve(playing(tagged, 1))

		expect(result?.provider).toBe("itunes")
		expect(calls.fileFor).toBe(0)
		expect(calls.identify).toBe(0)
	})

	it("identifies a file whose tags say nothing, which no text search can find", async () => {
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([candidate()])
		const { provider: musicbrainz } = fakeProvider([])
		const { source, asked } = fakeCoverSource({ "Me dejé llevar": "https://example.com/fp.jpg" })
		const { identifier } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		const result = await resolver.resolve(playing(untagged, 1))

		expect(itunesCalls.search).toBe(0)
		expect(asked).toEqual(["Me dejé llevar"])
		expect(result).toEqual({
			cover: "https://example.com/fp.jpg",
			provider: "acoustid",
			id: "097cfb49-419c-4b00-97f3-cc86ef4d77c2",
		})
	})

	it("files the answer under the file, not under the tags two files share", async () => {
		// Both files answer "Unknown" to every tag, so the tag derived key is the
		// same for both. Keyed that way, the first cover identified would be
		// served for the second file forever.
		const { cache, store } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource({
			"Me dejé llevar": "https://example.com/first.jpg",
			Ahora: "https://example.com/second.jpg",
		})
		const { identifier } = fakeIdentifier({ 1: FIRST_FILE, 2: SECOND_FILE }, (file) => ({
			kind: "identified",
			recording:
				file.path === FIRST_FILE.path
					? recording()
					: recording({ id: "other", releases: [{ title: "Ahora", releaseGroupId: "rg-2" }] }),
		}))
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		const first = await resolver.resolve(playing(untagged, 1))
		const second = await resolver.resolve(playing(untagged, 2))

		expect(first?.cover).toBe("https://example.com/first.jpg")
		expect(second?.cover).toBe("https://example.com/second.jpg")
		expect(store.get(fingerprintKey(FIRST_FILE))).not.toBeUndefined()
		expect(store.get(fingerprintKey(SECOND_FILE))).not.toBeUndefined()
	})

	it("reads the audio once, then answers every later poll from the cache", async () => {
		// Hashing the audio is the most expensive step in the chain locally, and
		// the presence loop asks again every 1.5 seconds.
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource({ "Me dejé llevar": "https://example.com/fp.jpg" })
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		await resolver.resolve(playing(untagged, 1))
		const again = await resolver.resolve(playing(untagged, 1))

		expect(again?.cover).toBe("https://example.com/fp.jpg")
		expect(calls.identify).toBe(1)
	})

	it("dedupes two concurrent polls of the same file into a single identification", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource({ "Me dejé llevar": "https://example.com/fp.jpg" })
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		const [first, second] = await Promise.all([
			resolver.resolve(playing(untagged, 1)),
			resolver.resolve(playing(untagged, 1)),
		])

		expect(first?.cover).toBe("https://example.com/fp.jpg")
		expect(second?.cover).toBe("https://example.com/fp.jpg")
		expect(calls.identify).toBe(1)
	})

	it("identifies a tagged file the catalogs could not match", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource({ "Me dejé llevar": "https://example.com/fp.jpg" })
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		const result = await resolver.resolve(playing(tagged, 1))

		expect(calls.identify).toBe(1)
		expect(result?.provider).toBe("acoustid")
	})

	it("behaves exactly as before when no key configured the step", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const resolver = new Resolver(cache, itunes, musicbrainz, source, noOverrides(), noLocator())

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags"])
	})

	it("answers nothing when the playing item is not a local file", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({})
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(calls.identify).toBe(0)
	})

	it("holds a service that could not answer for seconds, not for a day", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier } = fakeIdentifier({ 1: FIRST_FILE }, () => ({ kind: "unavailable" }))
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags", "provider-error"])
	})

	it("holds audio the service does not know for a day, not for seconds", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier } = fakeIdentifier({ 1: FIRST_FILE }, () => ({
			kind: "unidentified",
			reason: "no-results",
		}))
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags", "no-results"])
	})

	it("records an identification the archive has no artwork for as such", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags", "no-cover"])
	})

	it("stays quiet when the step throws instead of letting it reach the poll loop", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const identifier: AudioIdentifier = {
			fileFor: async () => FIRST_FILE,
			identify: async () => {
				throw new Error("fpcalc exploded")
			},
		}
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(untagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["insufficient-tags", "provider-error"])
	})

	it("never reaches the audio when the catalogs could not search at all", async () => {
		// iTunes and MusicBrainz are keyless and limited per machine, while the
		// fingerprint spends a budget every user of this app shares. An outage of
		// the two cheap ones must not move well tagged tracks onto the shared one,
		// which is the moment it can least absorb them.
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([], true)
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(tagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["provider-error"])
		expect(calls.fileFor).toBe(0)
		expect(calls.identify).toBe(0)
	})

	it("never reaches the audio for a catalog outage the cache is still holding", async () => {
		// The entry lives for seconds so the cheap catalogs are retried soon, and
		// until then it has to answer the same way the fresh failure did.
		const { cache } = fakeCache()
		const { provider: itunes, calls: itunesCalls } = fakeProvider([], true)
		const { provider: musicbrainz } = fakeProvider([], true)
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		await resolver.resolve(playing(tagged, 1))
		expect(await resolver.resolve(playing(tagged, 1))).toBeNull()

		expect(itunesCalls.search).toBe(1)
		expect(calls.identify).toBe(0)
	})

	it("never reaches the audio when the catalogs named the track and only the artwork was missing", async () => {
		// The recording is identified, so the fingerprint has no name left to add
		// and would spend a shared request to reach the same archive.
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: itunes } = fakeProvider([
			candidate({ releases: [{ id: "r1", title: "Me Dejé Llevar" }] }),
		])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			noOverrides(),
			noLocator(),
			identifier,
		)

		expect(await resolver.resolve(playing(tagged, 1))).toBeNull()
		expect(unresolvedReasons).toEqual(["no-cover"])
		expect(calls.identify).toBe(0)
	})

	it("never reaches the audio when the user already corrected the record", async () => {
		const { cache } = fakeCache()
		const { provider: itunes } = fakeProvider([])
		const { provider: musicbrainz } = fakeProvider([])
		const { source } = fakeCoverSource()
		const { identifier, calls } = fakeIdentifier({ 1: FIRST_FILE })
		const { overrides } = fakeOverrides({ "audio:christian nodal|me deje llevar": handPicked })
		const resolver = new Resolver(
			cache,
			itunes,
			musicbrainz,
			source,
			overrides,
			noLocator(),
			identifier,
		)

		const result = await resolver.resolve(playing(tagged, 1))

		expect(result?.provider).toBe("override")
		expect(calls.fileFor).toBe(0)
	})
})
