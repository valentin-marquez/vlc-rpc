import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import type { VideoOverride } from "@main/features/overrides"
import type { Cache } from "./catalog.cache"
import { type OverrideSource, Resolver } from "./catalog.resolver"
import type { CacheEntry, Candidate, CatalogProvider } from "./catalog.types"

function status(title: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0, time: 0, duration: 1200, rate: 1 },
		mediaType: "video",
		media: { title },
	}
}

function fakeCache() {
	const store = new Map<string, CacheEntry>()
	const calls = { get: 0, setResolved: 0, setUnresolved: 0, delete: 0 }
	const unresolvedReasons: string[] = []
	const cache = {
		get: (key: string) => {
			calls.get++
			return store.get(key) ?? null
		},
		setResolved: (
			key: string,
			work: { title: string; poster: string | null; mediaKind: "movie" | "tv" },
		) => {
			calls.setResolved++
			store.set(key, { status: "resolved", version: 1, work, lastAccessedAt: 0 })
		},
		setUnresolved: (key: string, reason: string) => {
			calls.setUnresolved++
			unresolvedReasons.push(reason)
			store.set(key, {
				status: "unresolved",
				version: 1,
				expiresAt: 999_999_999,
				lastAccessedAt: 0,
			})
		},
		delete: (key: string) => {
			calls.delete++
			store.delete(key)
		},
	}
	return { cache: cache as unknown as Cache, calls, unresolvedReasons, store }
}

function fakeProvider(results: Candidate[] | (() => Candidate[]), fails = false) {
	const calls = { search: 0 }
	const provider: CatalogProvider = {
		search: async () => {
			calls.search++
			if (fails) throw new Error("provider down")
			return typeof results === "function" ? results() : results
		},
	}
	return { provider, calls }
}

function fakeOverrides(entries: Record<string, VideoOverride> = {}) {
	const calls = { get: 0 }
	const overrides: OverrideSource = {
		get: (key: string) => {
			calls.get++
			return entries[key] ?? null
		},
	}
	return { overrides, calls }
}

/** The store as it stands for a user who has never corrected anything. */
function noOverrides(): OverrideSource {
	return fakeOverrides().overrides
}

function videoOverride(fields: Partial<Pick<VideoOverride, "title" | "cover" | "mediaKind">>) {
	const override: VideoOverride = {
		kind: "video",
		sourceFilename: "whatever.mkv",
		savedAt: 0,
		...fields,
	}
	return override
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		provider: "anilist",
		id: "1",
		title: "Some Show",
		aliases: [],
		mediaKind: "tv",
		posterUrl: "https://example.com/p.jpg",
		...overrides,
	}
}

describe("Resolver.resolve", () => {
	it("returns null for non video media", async () => {
		const { cache } = fakeCache()
		const { provider: anilist } = fakeProvider([])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const audioStatus: VlcStatus = { ...status("x"), mediaType: "audio" }
		expect(await resolver.resolve(audioStatus)).toBeNull()
	})

	it("routes fansub naming to AniList", async () => {
		const { cache } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Sora wa Akai Kawa no Hotori" }),
		])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(
			status("[SubsPlease] Sora wa Akai Kawa no Hotori - 11 (1080p) [ABCDEF12].mkv"),
		)

		expect(result?.title).toBe("Sora wa Akai Kawa no Hotori")
		expect(result?.episode).toBe(11)
		expect(anilistCalls.search).toBe(1)
	})

	it("routes ambiguous naming to AniList, since anime is often named the western way", async () => {
		const { cache } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Show" }),
		])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(status("[SubsPlease] Some Show S01E07 1080p.mkv"))

		expect(result?.title).toBe("Some Show")
		expect(anilistCalls.search).toBe(1)
	})

	it("routes western naming to no provider at all, and caches the miss as stable", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Show" }),
		])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		// AniList does not hold western film or television, so the request is
		// never spent. "no-results" and not "provider-error": nothing was asked,
		// so nothing failed, and a short retry TTL would re-run this on every poll.
		expect(result).toBeNull()
		expect(anilistCalls.search).toBe(0)
		expect(unresolvedReasons).toEqual(["no-results"])
	})

	it("returns a cache hit without calling any provider, overlaying the fresh episode", async () => {
		const { cache, store } = fakeCache()
		store.set("tv:Some Show|1", {
			status: "resolved",
			version: 1,
			work: { title: "Some Show", poster: "https://example.com/p.jpg", mediaKind: "tv" },
			lastAccessedAt: 0,
		})
		const { provider: anilist, calls: anilistCalls } = fakeProvider([])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		expect(result).toEqual({
			title: "Some Show",
			poster: "https://example.com/p.jpg",
			mediaKind: "tv",
			season: 1,
			episode: 7,
		})
		expect(anilistCalls.search).toBe(0)
	})

	it("dedupes two concurrent calls for the same key into a single provider search", async () => {
		const { cache } = fakeCache()
		let resolveSearch: (value: Candidate[]) => void = () => {}
		const pending = new Promise<Candidate[]>((resolve) => {
			resolveSearch = resolve
		})
		const { provider: anilist, calls } = fakeProvider(() => {
			throw new Error("should not be called synchronously")
		})
		anilist.search = async () => {
			calls.search++
			return pending
		}
		const resolver = new Resolver(cache, anilist, noOverrides())

		const filename = "[SubsPlease] Some Show - 07 (1080p) [ABCDEF12].mkv"
		const first = resolver.resolve(status(filename))
		const second = resolver.resolve(status(filename))

		resolveSearch([candidate({ title: "Some Show" })])
		const [firstResult, secondResult] = await Promise.all([first, second])

		expect(calls.search).toBe(1)
		expect(firstResult?.title).toBe("Some Show")
		expect(secondResult?.title).toBe("Some Show")
	})

	it("caches as unresolved and returns null when nothing passes the scorer", async () => {
		const { cache, calls } = fakeCache()
		const { provider: anilist } = fakeProvider([candidate({ title: "Totally Different Title" })])
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(
			status("[SubsPlease] Some Show - 07 (1080p) [ABCDEF12].mkv"),
		)

		expect(result).toBeNull()
		expect(calls.setUnresolved).toBe(1)
	})

	it("caches a miss as a transient provider failure, not no results, when AniList fails", async () => {
		const { cache, unresolvedReasons } = fakeCache()
		const { provider: anilist } = fakeProvider([], true)
		const resolver = new Resolver(cache, anilist, noOverrides())

		const result = await resolver.resolve(status("[SubsPlease] Some Show S01E07 1080p.mkv"))

		expect(result).toBeNull()
		expect(unresolvedReasons).toEqual(["provider-error"])
	})

	it("returns an override without asking a provider and without reading the cache", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Show" }),
		])
		const { overrides } = fakeOverrides({
			"tv:Some Show|1": videoOverride({ title: "The Show It Really Is" }),
		})
		const resolver = new Resolver(cache, anilist, overrides)

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		expect(result?.title).toBe("The Show It Really Is")
		expect(anilistCalls.search).toBe(0)
		expect(cacheCalls.get).toBe(0)
		expect(cacheCalls.setResolved).toBe(0)
		expect(cacheCalls.setUnresolved).toBe(0)
	})

	it("carries the title, the cover and the media kind of an override into the result", async () => {
		const { cache } = fakeCache()
		const { provider: anilist } = fakeProvider([candidate({ title: "Some Show" })])
		const { overrides } = fakeOverrides({
			"tv:Some Show|1": videoOverride({
				title: "The Show It Really Is",
				cover: "https://example.com/by-hand.jpg",
				mediaKind: "movie",
			}),
		})
		const resolver = new Resolver(cache, anilist, overrides)

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		// The kind is the override's even though the filename says S01E07, which
		// is the whole point: the parse is what the user was correcting. Season
		// and episode still come from the filename, they are not overridable.
		expect(result).toEqual({
			title: "The Show It Really Is",
			poster: "https://example.com/by-hand.jpg",
			mediaKind: "movie",
			season: 1,
			episode: 7,
		})
	})

	it("fills the fields an override leaves out from the local parse, not from a provider", async () => {
		const { cache, calls: cacheCalls } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Show", posterUrl: "https://example.com/anilist.jpg" }),
		])
		const { overrides } = fakeOverrides({
			"tv:Some Show|1": videoOverride({ cover: "https://example.com/by-hand.jpg" }),
		})
		const resolver = new Resolver(cache, anilist, overrides)

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		expect(result).toEqual({
			title: "Some Show",
			poster: "https://example.com/by-hand.jpg",
			mediaKind: "tv",
			season: 1,
			episode: 7,
		})
		expect(anilistCalls.search).toBe(0)
		expect(cacheCalls.get).toBe(0)
	})

	it("leaves the poster empty when an override carries no cover, rather than resolving one", async () => {
		const { cache } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Movie", mediaKind: "movie" }),
		])
		const { overrides } = fakeOverrides({
			"movie:Some Movie|2019": videoOverride({ title: "The Movie It Really Is" }),
		})
		const resolver = new Resolver(cache, anilist, overrides)

		const result = await resolver.resolve(status("Some.Movie.2019.1080p.BluRay.x264.mp4"))

		expect(result).toEqual({
			title: "The Movie It Really Is",
			poster: null,
			mediaKind: "movie",
			season: undefined,
			episode: undefined,
		})
		expect(anilistCalls.search).toBe(0)
	})

	it("resolves as usual when the store holds no override for the key", async () => {
		const { cache } = fakeCache()
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Some Show" }),
		])
		const { overrides, calls: overrideCalls } = fakeOverrides({
			"tv:Another Show|1": videoOverride({ title: "Not This One" }),
		})
		const resolver = new Resolver(cache, anilist, overrides)

		const result = await resolver.resolve(status("[SubsPlease] Some Show S01E07 1080p.mkv"))

		expect(result?.title).toBe("Some Show")
		expect(overrideCalls.get).toBe(1)
		expect(anilistCalls.search).toBe(1)
	})
})

describe("Resolver.evictOverride", () => {
	function seed(store: Map<string, CacheEntry>, key: string, title: string): void {
		store.set(key, {
			status: "resolved",
			version: 1,
			work: { title, poster: "https://example.com/p.jpg", mediaKind: "tv" },
			lastAccessedAt: 0,
		})
	}

	it("drops the entry cached under the key the override corrects", () => {
		const { cache, store, calls } = fakeCache()
		const { provider: anilist } = fakeProvider([])
		const resolver = new Resolver(cache, anilist, noOverrides())
		seed(store, "tv:Some Show|1", "Some Show")

		resolver.evictOverride("tv:Some Show|1")

		expect(store.has("tv:Some Show|1")).toBe(false)
		expect(calls.delete).toBe(1)
	})

	it("leaves every other cached work alone", () => {
		const { cache, store } = fakeCache()
		const { provider: anilist } = fakeProvider([])
		const resolver = new Resolver(cache, anilist, noOverrides())
		seed(store, "tv:Some Show|1", "Some Show")
		seed(store, "tv:Some Show|2", "Some Show")

		resolver.evictOverride("tv:Some Show|1")

		expect(store.has("tv:Some Show|2")).toBe(true)
	})
})
