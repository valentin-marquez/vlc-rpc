import type { Clock } from "@main/core/clock"
import { Conf } from "electron-conf/main"
import type { CacheEntry, MusicResult, UnresolvedReason } from "./music.types"

// Its own counter, never the catalog cache's: the two features share no code
// path, so a change to the video scorer must not silently wipe every cached
// music lookup, and vice versa.
const CACHE_VERSION = 1
const MAX_RESOLVED_ENTRIES = 200
const TRANSIENT_TTL_MS = 5_000
const STABLE_TTL_MS = 24 * 60 * 60_000
// The presence loop resolves every tick, and every `conf.set` is a synchronous
// full file write, so a read hit only persists its access once the recorded
// time is this stale. LRU ordering does not need millisecond resolution.
const ACCESS_GRANULARITY_MS = 60_000

interface MusicCacheSchema {
	entries: Record<string, CacheEntry>
}

export class Cache {
	private readonly conf: Conf<MusicCacheSchema>

	constructor(private readonly clock: Clock) {
		this.conf = new Conf<MusicCacheSchema>({
			name: "music-cache",
			defaults: { entries: {} },
		})
	}

	public get(key: string): CacheEntry | null {
		const entries = this.conf.get("entries")
		const entry = entries[key]
		if (!entry || entry.version !== CACHE_VERSION) {
			return null
		}

		const now = this.clock.now()
		if (entry.status === "unresolved" && entry.expiresAt <= now) {
			delete entries[key]
			this.conf.set("entries", entries)
			return null
		}

		if (now - entry.lastAccessedAt >= ACCESS_GRANULARITY_MS) {
			entries[key] = { ...entry, lastAccessedAt: now }
			this.conf.set("entries", entries)
		}
		return entry
	}

	public setResolved(key: string, result: MusicResult): void {
		const entries = this.conf.get("entries")
		entries[key] = {
			status: "resolved",
			version: CACHE_VERSION,
			result,
			lastAccessedAt: this.clock.now(),
		}
		this.evictIfNeeded(entries)
		this.conf.set("entries", entries)
	}

	public setUnresolved(key: string, reason: UnresolvedReason): void {
		const entries = this.conf.get("entries")
		this.dropExpired(entries)
		const ttl = reason === "provider-error" ? TRANSIENT_TTL_MS : STABLE_TTL_MS
		entries[key] = {
			status: "unresolved",
			version: CACHE_VERSION,
			expiresAt: this.clock.now() + ttl,
			lastAccessedAt: this.clock.now(),
		}
		this.conf.set("entries", entries)
	}

	/**
	 * Removes one entry. Saving an override needs it: a resolved entry has no TTL
	 * and only the cap above it, so a correction laid on top of an already cached
	 * answer would let the old cover come back the day the user removes the
	 * correction, and stay.
	 */
	public delete(key: string): void {
		const entries = this.conf.get("entries")
		if (!(key in entries)) return
		delete entries[key]
		this.conf.set("entries", entries)
	}

	// Unresolved entries do not count against the resolved cap, so without this
	// every track this feature ever failed to identify would leave a permanent row.
	private dropExpired(entries: Record<string, CacheEntry>): void {
		const now = this.clock.now()
		for (const [key, entry] of Object.entries(entries)) {
			if (entry.status === "unresolved" && entry.expiresAt <= now) {
				delete entries[key]
			}
		}
	}

	private evictIfNeeded(entries: Record<string, CacheEntry>): void {
		const resolvedKeys = Object.keys(entries).filter((key) => entries[key]?.status === "resolved")
		if (resolvedKeys.length <= MAX_RESOLVED_ENTRIES) return

		resolvedKeys.sort(
			(a, b) => (entries[a]?.lastAccessedAt ?? 0) - (entries[b]?.lastAccessedAt ?? 0),
		)
		const overflow = resolvedKeys.length - MAX_RESOLVED_ENTRIES
		for (let i = 0; i < overflow; i++) {
			const key = resolvedKeys[i]
			if (key !== undefined) {
				delete entries[key]
			}
		}
	}
}
