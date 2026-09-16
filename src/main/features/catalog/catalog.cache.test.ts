import type { Clock } from "@main/core/clock"
import { afterEach, describe, expect, it, vi } from "vitest"

// The store of the most recently built Conf, so a test can seed a row no public
// method can write (an older version) and can count the writes to disk.
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

import { Cache } from "./catalog.cache"
import type { CacheEntry } from "./catalog.types"

class FakeClock implements Clock {
	private currentMs = 0
	now(): number {
		return this.currentMs
	}
	advance(ms: number): void {
		this.currentMs += ms
	}
}

afterEach(() => {
	vi.clearAllMocks()
})

describe("Cache", () => {
	it("returns null on a miss", () => {
		const cache = new Cache(new FakeClock())
		expect(cache.get("tv:Show|1")).toBeNull()
	})

	it("returns a resolved entry after setResolved", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("tv:Show|1", { title: "Show", poster: null, mediaKind: "tv" })

		const entry = cache.get("tv:Show|1")
		expect(entry?.status).toBe("resolved")
		expect(entry && entry.status === "resolved" ? entry.work.title : null).toBe("Show")
	})

	it("returns an unresolved entry while it is still within its TTL", () => {
		const cache = new Cache(new FakeClock())
		cache.setUnresolved("tv:Show|1", "no-match")
		expect(cache.get("tv:Show|1")?.status).toBe("unresolved")
	})

	it("treats an unresolved entry as a miss once its TTL expires", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("tv:Show|1", "provider-error")

		clock.advance(6_000)

		expect(cache.get("tv:Show|1")).toBeNull()
	})

	it("gives no-match a longer TTL than a transient provider error", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("tv:Show|1", "no-match")

		clock.advance(6_000)

		const entry = cache.get("tv:Show|1")
		expect(entry).not.toBeNull()
	})

	it("treats an entry written by an older cache version as a miss", () => {
		const cache = new Cache(new FakeClock())
		const stale: CacheEntry = {
			status: "resolved",
			version: 0,
			work: { title: "Show", poster: null, mediaKind: "tv" },
			lastAccessedAt: 0,
		}
		disk.entries["tv:Show|1"] = stale

		expect(cache.get("tv:Show|1")).toBeNull()
	})

	it("deletes an expired unresolved entry instead of leaving the row behind", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("tv:Show|1", "provider-error")

		clock.advance(6_000)
		cache.get("tv:Show|1")

		expect(disk.entries["tv:Show|1"]).toBeUndefined()
	})

	it("sweeps expired unresolved entries when a new one is written", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("tv:Old|1", "provider-error")

		clock.advance(6_000)
		cache.setUnresolved("tv:New|1", "no-match")

		expect(disk.entries["tv:Old|1"]).toBeUndefined()
		expect(disk.entries["tv:New|1"]).toBeDefined()
	})

	it("does not write to disk on every read hit", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setResolved("tv:Show|1", { title: "Show", poster: null, mediaKind: "tv" })
		const writesAfterSet = disk.writes

		for (let i = 0; i < 10; i++) {
			clock.advance(1_000)
			cache.get("tv:Show|1")
		}
		expect(disk.writes).toBe(writesAfterSet)

		clock.advance(60_000)
		cache.get("tv:Show|1")
		expect(disk.writes).toBe(writesAfterSet + 1)
	})

	it("evicts an untouched resolved entry and keeps one a read touched", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)

		for (let i = 0; i < 200; i++) {
			cache.setResolved(`tv:Show${i}|1`, { title: `Show${i}`, poster: null, mediaKind: "tv" })
			clock.advance(1)
		}

		clock.advance(60_000)
		cache.get("tv:Show0|1")

		cache.setResolved("tv:Show200|1", { title: "Show200", poster: null, mediaKind: "tv" })

		expect(cache.get("tv:Show0|1")).not.toBeNull()
		expect(cache.get("tv:Show1|1")).toBeNull()
		expect(cache.get("tv:Show200|1")).not.toBeNull()
	})
})
