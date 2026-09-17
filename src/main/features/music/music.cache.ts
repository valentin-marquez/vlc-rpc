import type { Clock } from "@main/core/clock"
import { Conf } from "electron-conf/main"
import type { CacheEntry, IdentifiedName, MusicResult, UnresolvedReason } from "./music.types"

// Its own counter, never the catalog cache's: the two features share no code
// path, so a change to the video scorer must not silently wipe every cached
// music lookup, and vice versa. Bump it whenever an entry gains a field the
// reader would otherwise have to guess at, since a resolved entry never
// expires: 2 added the reason behind a miss, 3 the name an acoustic match
// identified. Exported so a test double stamps the number the real one does.
export const CACHE_VERSION = 3
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

	/**
	 * The name is optional and only ever arrives with `no-cover`: the audio was
	 * identified and the archive had no artwork for it, which is a miss the cover
	 * has to remember and an answer the text can still use.
	 */
	public setUnresolved(key: string, reason: UnresolvedReason, name?: IdentifiedName): void {
		const entries = this.conf.get("entries")
		this.dropExpired(entries)
		const ttl = reason === "provider-error" ? TRANSIENT_TTL_MS : STABLE_TTL_MS
		entries[key] = {
			status: "unresolved",
			version: CACHE_VERSION,
			reason,
			expiresAt: this.clock.now() + ttl,
			lastAccessedAt: this.clock.now(),
			...(name === undefined ? {} : { name }),
		}
		this.conf.set("entries", entries)
	}

	/**
	 * Removes every entry whose key the predicate accepts, in one pass and one
	 * write. An audio override is filed per record while these keys are per track,
	 * so evicting one correction is a question no single key can answer, and the
	 * caller owns the key shapes: this walks, it does not interpret.
	 */
	public deleteWhere(matches: (key: string) => boolean): void {
		const entries = this.conf.get("entries")
		const doomed = Object.keys(entries).filter(matches)
		if (doomed.length === 0) return

		for (const key of doomed) {
			delete entries[key]
		}
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
