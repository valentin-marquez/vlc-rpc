import type { Clock } from "@main/core/clock"
import { afterEach, describe, expect, it, vi } from "vitest"

// The store of the most recently built Conf, so a test can read what actually
// reached disk instead of trusting the accessor it is testing.
const disk = vi.hoisted(() => ({
	entries: {} as Record<string, unknown>,
	writes: 0,
}))

vi.mock("electron-conf/main", () => {
	class FakeConf<T extends Record<string, unknown>> {
		private store: T
		constructor(opts: { defaults: T }) {
			this.store = structuredClone(opts.defaults)
			disk.entries = this.store.entries as Record<string, unknown>
			disk.writes = 0
		}
		get<K extends keyof T>(key: K): T[K] {
			return this.store[key]
		}
		set<K extends keyof T>(key: K, value: T[K]): void {
			this.store[key] = value
			disk.entries = this.store.entries as Record<string, unknown>
			disk.writes++
		}
	}
	return { Conf: FakeConf }
})

import { Store } from "./overrides.store"

class FakeClock implements Clock {
	private currentMs = 0
	now(): number {
		return this.currentMs
	}
	advance(ms: number): void {
		this.currentMs += ms
	}
}

// What the two caches next door would have done to an entry by now.
const CACHE_STABLE_TTL_MS = 24 * 60 * 60_000
const CACHE_MAX_RESOLVED_ENTRIES = 200

afterEach(() => {
	vi.clearAllMocks()
})

describe("Store", () => {
	it("returns null for a key nobody has corrected", () => {
		const store = new Store(new FakeClock())
		expect(store.get("tv:Show|1")).toBeNull()
	})

	it("round trips a video override with title, cover and media kind", () => {
		const clock = new FakeClock()
		clock.advance(1_700_000_000_000)
		const store = new Store(clock)

		store.save("tv:Red River|1", {
			kind: "video",
			title: "Sora wa Akai Kawa no Hotori",
			cover: "https://example.com/poster.jpg",
			mediaKind: "tv",
			sourceFilename: "[Group] Red River - 01 [1080p].mkv",
		})

		expect(store.get("tv:Red River|1")).toEqual({
			kind: "video",
			title: "Sora wa Akai Kawa no Hotori",
			cover: "https://example.com/poster.jpg",
			mediaKind: "tv",
			sourceFilename: "[Group] Red River - 01 [1080p].mkv",
			savedAt: 1_700_000_000_000,
		})
	})

	it("round trips a cover only video override", () => {
		const store = new Store(new FakeClock())

		store.save("movie:Heat|1995", {
			kind: "video",
			cover: "https://example.com/heat.jpg",
			sourceFilename: "Heat.1995.mkv",
		})

		const saved = store.get("movie:Heat|1995")
		expect(saved?.cover).toBe("https://example.com/heat.jpg")
		expect(saved?.kind === "video" ? saved.title : undefined).toBeUndefined()
		expect(saved?.kind === "video" ? saved.mediaKind : undefined).toBeUndefined()
	})

	it("round trips an audio override with only the cover, which is the only field the case carries", () => {
		const store = new Store(new FakeClock())

		store.save("album:daft punk|discovery", {
			kind: "audio",
			cover: "https://example.com/discovery.jpg",
			sourceFilename: "01 - One More Time.flac",
		})

		const saved = store.get("album:daft punk|discovery")
		expect(saved).toEqual({
			kind: "audio",
			cover: "https://example.com/discovery.jpg",
			sourceFilename: "01 - One More Time.flac",
			savedAt: 0,
		})
		expect(saved && !("title" in saved)).toBe(true)
		expect(saved && !("mediaKind" in saved)).toBe(true)
	})

	it("stops returning an override the user deleted", () => {
		const store = new Store(new FakeClock())
		store.save("movie:Heat|1995", { kind: "video", title: "Heat", sourceFilename: "Heat.1995.mkv" })

		store.delete("movie:Heat|1995")

		expect(store.get("movie:Heat|1995")).toBeNull()
		expect(disk.entries["movie:Heat|1995"]).toBeUndefined()
	})

	it("lists every saved override with the key it is bound to", () => {
		const store = new Store(new FakeClock())
		store.save("movie:Heat|1995", { kind: "video", title: "Heat", sourceFilename: "Heat.1995.mkv" })
		store.save("tv:Show|1", { kind: "video", title: "Show", sourceFilename: "Show.S01E01.mkv" })

		const listed = store.list()

		expect(listed).toHaveLength(2)
		expect(listed.map((entry) => entry.key).sort()).toEqual(["movie:Heat|1995", "tv:Show|1"])
		const show = listed.find((entry) => entry.key === "tv:Show|1")?.override
		expect(show?.kind === "video" ? show.title : undefined).toBe("Show")
	})

	it("refuses a key with an empty title component, which would apply to every unparseable file", () => {
		const store = new Store(new FakeClock())

		expect(() =>
			store.save("video:", { kind: "video", title: "Whatever", sourceFilename: "9wjr3.mkv" }),
		).toThrow()
		expect(disk.entries["video:"]).toBeUndefined()
		expect(store.get("video:")).toBeNull()
	})

	it("refuses an empty title component in any key shape", () => {
		const store = new Store(new FakeClock())

		expect(() =>
			store.save("tv:|1", { kind: "video", title: "Show", sourceFilename: "S01E01.mkv" }),
		).toThrow()
		expect(() =>
			store.save("movie: |1995", { kind: "video", title: "Heat", sourceFilename: "x.mkv" }),
		).toThrow()
		expect(() =>
			store.save("", { kind: "video", title: "Show", sourceFilename: "x.mkv" }),
		).toThrow()
		expect(disk.writes).toBe(0)
	})

	it("says in advance which keys it would refuse, so nothing offers the user one", () => {
		const store = new Store(new FakeClock())

		expect(store.accepts("tv:Show|1")).toBe(true)
		expect(store.accepts("audio:christian nodal|me deje llevar")).toBe(true)
		expect(store.accepts("video:")).toBe(false)
		expect(store.accepts("tv:|1")).toBe(false)
		expect(store.accepts("audio:|me deje llevar")).toBe(false)
		expect(store.accepts("")).toBe(false)
	})

	it("refuses to save exactly the keys it said it would refuse", () => {
		const store = new Store(new FakeClock())
		const draft = { kind: "video", title: "Whatever", sourceFilename: "x.mkv" } as const

		for (const key of ["video:", "tv:|1", "audio:|record", ""]) {
			expect(store.accepts(key)).toBe(false)
			expect(() => store.save(key, draft)).toThrow()
		}
		expect(disk.writes).toBe(0)
	})

	it("keeps an override past the cache TTL and past the cache entry cap", () => {
		const clock = new FakeClock()
		const store = new Store(clock)
		store.save("movie:Heat|1995", { kind: "video", title: "Heat", sourceFilename: "Heat.1995.mkv" })

		clock.advance(CACHE_STABLE_TTL_MS * 30)
		for (let i = 0; i <= CACHE_MAX_RESOLVED_ENTRIES; i++) {
			store.save(`tv:Show${i}|1`, {
				kind: "video",
				title: `Show${i}`,
				sourceFilename: `Show${i}.mkv`,
			})
		}

		const kept = store.get("movie:Heat|1995")
		expect(kept?.kind === "video" ? kept.title : undefined).toBe("Heat")
		expect(store.list()).toHaveLength(CACHE_MAX_RESOLVED_ENTRIES + 2)
	})
})
