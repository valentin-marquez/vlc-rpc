import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mockTmdbApiKey } = vi.hoisted(() => ({ mockTmdbApiKey: { value: "" } }))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => (key === "tmdbApiKey" ? mockTmdbApiKey.value : undefined),
	},
}))

import type { Cache } from "./catalog.cache"
import { Resolver } from "./catalog.resolver"
import type { CacheEntry, Candidate, CatalogProvider } from "./catalog.types"

afterEach(() => {
	mockTmdbApiKey.value = ""
})

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
	const calls = { get: 0, setResolved: 0, setUnresolved: 0 }
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
			store.set(key, {
				status: "unresolved",
				version: 1,
				expiresAt: 999_999_999,
				lastAccessedAt: 0,
			})
			void reason
		},
	}
	return { cache: cache as unknown as Cache, calls, store }
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
		const { provider: tmdb } = fakeProvider([])
		const { provider: anilist } = fakeProvider([])
		const resolver = new Resolver(cache, tmdb, anilist)

		const audioStatus: VlcStatus = { ...status("x"), mediaType: "audio" }
		expect(await resolver.resolve(audioStatus)).toBeNull()
	})

	it("routes fansub naming to AniList only", async () => {
		const { cache } = fakeCache()
		const { provider: tmdb, calls: tmdbCalls } = fakeProvider([])
		const { provider: anilist, calls: anilistCalls } = fakeProvider([
			candidate({ title: "Sora wa Akai Kawa no Hotori" }),
		])
		const resolver = new Resolver(cache, tmdb, anilist)

		const result = await resolver.resolve(
			status("[SubsPlease] Sora wa Akai Kawa no Hotori - 11 (1080p) [ABCDEF12].mkv"),
		)

		expect(result?.title).toBe("Sora wa Akai Kawa no Hotori")
		expect(result?.episode).toBe(11)
		expect(anilistCalls.search).toBe(1)
		expect(tmdbCalls.search).toBe(0)
	})

	it("returns a cache hit without calling any provider, overlaying the fresh episode", async () => {
		const { cache, store } = fakeCache()
		store.set("tv:Some Show|1", {
			status: "resolved",
			version: 1,
			work: { title: "Some Show", poster: "https://example.com/p.jpg", mediaKind: "tv" },
			lastAccessedAt: 0,
		})
		const { provider: tmdb, calls: tmdbCalls } = fakeProvider([])
		const { provider: anilist, calls: anilistCalls } = fakeProvider([])
		const resolver = new Resolver(cache, tmdb, anilist)

		const result = await resolver.resolve(status("Some.Show.S01E07.1080p.WEB-DL.mp4"))

		expect(result).toEqual({
			title: "Some Show",
			poster: "https://example.com/p.jpg",
			mediaKind: "tv",
			season: 1,
			episode: 7,
		})
		expect(tmdbCalls.search).toBe(0)
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
		const { provider: tmdb } = fakeProvider([])
		const resolver = new Resolver(cache, tmdb, anilist)

		const filename = "[SubsPlease] Some Show - 07 (1080p) [ABCDEF12].mkv"
		const first = resolver.resolve(status(filename))
		const second = resolver.resolve(status(filename))

		resolveSearch([candidate({ title: "Some Show" })])
		const [firstResult, secondResult] = await Promise.all([first, second])

		expect(calls.search).toBe(1)
		expect(firstResult?.title).toBe("Some Show")
		expect(secondResult?.title).toBe("Some Show")
	})

	it("keeps candidates from a provider that succeeded when the other times out, in the ambiguous case", async () => {
		const { cache } = fakeCache()
		const { provider: anilist } = fakeProvider([candidate({ title: "KAMUI Hes Behind You" })])
		const { provider: tmdb } = fakeProvider([], true)
		const resolver = new Resolver(cache, tmdb, anilist)

		const result = await resolver.resolve(
			status("[ToonsHub] KAMUI Hes Behind You S00E11 1080p AMZN WEB-DL DDP2.0 H.264 (Multi-Subs)"),
		)

		expect(result?.title).toBe("KAMUI Hes Behind You")
	})

	it("caches as unresolved and returns null when nothing passes the scorer", async () => {
		const { cache, calls } = fakeCache()
		const { provider: anilist } = fakeProvider([candidate({ title: "Totally Different Title" })])
		const { provider: tmdb } = fakeProvider([])
		const resolver = new Resolver(cache, tmdb, anilist)

		const result = await resolver.resolve(
			status("[SubsPlease] Some Show - 07 (1080p) [ABCDEF12].mkv"),
		)

		expect(result).toBeNull()
		expect(calls.setUnresolved).toBe(1)
	})
})
