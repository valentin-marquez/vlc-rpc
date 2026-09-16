import type { Clock } from "@main/core/clock"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron-conf/main", () => {
	class FakeConf<T extends Record<string, unknown>> {
		private store: T
		constructor(opts: { defaults: T }) {
			this.store = structuredClone(opts.defaults)
		}
		get<K extends keyof T>(key: K): T[K] {
			return this.store[key]
		}
		set<K extends keyof T>(key: K, value: T[K]): void {
			this.store[key] = value
		}
	}
	return { Conf: FakeConf }
})

import { Cache } from "./catalog.cache"

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

	it("evicts the least recently used resolved entry once past the cap", () => {
		const clock = new FakeClock()
		const cache = new Cache(clock)

		for (let i = 0; i < 200; i++) {
			cache.setResolved(`tv:Show${i}|1`, { title: `Show${i}`, poster: null, mediaKind: "tv" })
			clock.advance(1)
		}

		cache.setResolved("tv:Show200|1", { title: "Show200", poster: null, mediaKind: "tv" })

		expect(cache.get("tv:Show0|1")).toBeNull()
		expect(cache.get("tv:Show200|1")).not.toBeNull()
	})
})
