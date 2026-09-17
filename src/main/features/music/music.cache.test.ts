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

import { Cache } from "./music.cache"
import type { CacheEntry, MusicResult } from "./music.types"

class FakeClock implements Clock {
	private currentMs = 0
	now(): number {
		return this.currentMs
	}
	advance(ms: number): void {
		this.currentMs += ms
	}
}

function result(id: string): MusicResult {
	return { cover: `https://covers.example/${id}.jpg`, provider: "itunes", id }
}

afterEach(() => {
	vi.clearAllMocks()
})

describe("Cache", () => {
	it("returns null on a miss", () => {
		const cache = new Cache(new FakeClock())
		expect(cache.get("track:Song|1")).toBeNull()
	})

	it("returns a resolved entry after setResolved", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:Song|1", result("1"))

		const entry = cache.get("track:Song|1")
		expect(entry?.status).toBe("resolved")
		expect(entry && entry.status === "resolved" ? entry.result.id : null).toBe("1")
	})

	it("returns an unresolved entry while it is still within its TTL", () => {
		const cache = new Cache(new FakeClock())
		cache.setUnresolved("track:Song|1", "no-match")
		expect(cache.get("track:Song|1")?.status).toBe("unresolved")
	})

	it("treats an unresolved entry as a miss once its TTL expires", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("track:Song|1", "provider-error")

		clock.advance(6_000)

		expect(cache.get("track:Song|1")).toBeNull()
	})

	it("gives provider-error a much shorter TTL than no-match", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("track:Error|1", "provider-error")
		cache.setUnresolved("track:NoMatch|1", "no-match")

		// Past the provider-error TTL but nowhere near the no-match one.
		clock.advance(6_000)

		expect(cache.get("track:Error|1")).toBeNull()
		expect(cache.get("track:NoMatch|1")).not.toBeNull()
	})

	it("treats every long lived reason the same way, distinct from provider-error", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("track:A|1", "insufficient-tags")
		cache.setUnresolved("track:B|1", "no-results")
		cache.setUnresolved("track:C|1", "no-cover")

		clock.advance(6_000)

		expect(cache.get("track:A|1")).not.toBeNull()
		expect(cache.get("track:B|1")).not.toBeNull()
		expect(cache.get("track:C|1")).not.toBeNull()
	})

	it("treats an entry written by an older cache version as a miss", () => {
		const cache = new Cache(new FakeClock())
		const stale: CacheEntry = {
			status: "resolved",
			version: 0,
			result: result("1"),
			lastAccessedAt: 0,
		}
		disk.entries["track:Song|1"] = stale

		expect(cache.get("track:Song|1")).toBeNull()
	})

	it("treats a stale versioned unresolved entry as a miss even within its TTL", () => {
		const cache = new Cache(new FakeClock())
		const stale: CacheEntry = {
			status: "unresolved",
			version: 0,
			reason: "no-match",
			expiresAt: 1_000_000,
			lastAccessedAt: 0,
		}
		disk.entries["track:Song|1"] = stale

		expect(cache.get("track:Song|1")).toBeNull()
	})

	it("deletes an expired unresolved entry instead of leaving the row behind", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("track:Song|1", "provider-error")

		clock.advance(6_000)
		cache.get("track:Song|1")

		expect(disk.entries["track:Song|1"]).toBeUndefined()
	})

	it("sweeps expired unresolved entries when a new one is written", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setUnresolved("track:Old|1", "provider-error")

		clock.advance(6_000)
		cache.setUnresolved("track:New|1", "no-match")

		expect(disk.entries["track:Old|1"]).toBeUndefined()
		expect(disk.entries["track:New|1"]).toBeDefined()
	})

	it("does not write to disk on every read hit", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)
		cache.setResolved("track:Song|1", result("1"))
		const writesAfterSet = disk.writes

		for (let i = 0; i < 10; i++) {
			clock.advance(1_000)
			cache.get("track:Song|1")
		}
		expect(disk.writes).toBe(writesAfterSet)

		clock.advance(60_000)
		cache.get("track:Song|1")
		expect(disk.writes).toBe(writesAfterSet + 1)
	})

	it("evicts an untouched resolved entry and keeps one a read touched", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)

		for (let i = 0; i < 200; i++) {
			cache.setResolved(`track:Song${i}|1`, result(`${i}`))
			clock.advance(1)
		}

		// Both track:Song0 and track:Song1 were written at the very start, equally
		// old by insertion order. Only the read below marks Song0 as recently used,
		// so a cache evicting by use rather than by insertion order must spare it
		// and drop Song1 instead.
		clock.advance(60_000)
		cache.get("track:Song0|1")

		cache.setResolved("track:Song200|1", result("200"))

		expect(cache.get("track:Song0|1")).not.toBeNull()
		expect(cache.get("track:Song1|1")).toBeNull()
		expect(cache.get("track:Song200|1")).not.toBeNull()
	})

	it("removes an entry so the next read is a miss", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:Song|1", result("1"))

		cache.delete("track:Song|1")

		expect(cache.get("track:Song|1")).toBeNull()
		expect(disk.entries["track:Song|1"]).toBeUndefined()
	})

	it("leaves every other entry alone when one is deleted", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:Song|1", result("1"))
		cache.setResolved("track:Other|1", result("2"))

		cache.delete("track:Song|1")

		expect(cache.get("track:Other|1")).not.toBeNull()
	})

	it("does nothing, and does not write to disk, when the key was never cached", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:Song|1", result("1"))
		const writesAfterSet = disk.writes

		cache.delete("track:Missing|1")

		expect(disk.writes).toBe(writesAfterSet)
		expect(cache.get("track:Song|1")).not.toBeNull()
	})

	it("removes every entry the predicate accepts and keeps the rest", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:nodal|probablemente|me deje llevar", result("1"))
		cache.setResolved("track:nodal|de los besos|me deje llevar", result("2"))
		cache.setResolved("track:nodal|adios amor|ahora", result("3"))

		cache.deleteWhere((key) => key.endsWith("|me deje llevar"))

		expect(cache.get("track:nodal|probablemente|me deje llevar")).toBeNull()
		expect(cache.get("track:nodal|de los besos|me deje llevar")).toBeNull()
		expect(cache.get("track:nodal|adios amor|ahora")).not.toBeNull()
	})

	it("removes every match in a single write to disk", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:nodal|probablemente|me deje llevar", result("1"))
		cache.setResolved("track:nodal|de los besos|me deje llevar", result("2"))
		const writesAfterSet = disk.writes

		cache.deleteWhere((key) => key.endsWith("|me deje llevar"))

		expect(disk.writes).toBe(writesAfterSet + 1)
	})

	it("does not write to disk when the predicate accepts nothing", () => {
		const cache = new Cache(new FakeClock())
		cache.setResolved("track:Song|1", result("1"))
		const writesAfterSet = disk.writes

		cache.deleteWhere(() => false)

		expect(disk.writes).toBe(writesAfterSet)
		expect(cache.get("track:Song|1")).not.toBeNull()
	})
})
