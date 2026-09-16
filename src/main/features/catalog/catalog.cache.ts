import type { Clock } from "@main/core/clock"
import { Conf } from "electron-conf/main"
import type { CacheEntry, CachedWork, UnresolvedReason } from "./catalog.types"

// Bump when the parser, the normalizers or the scorer change in a way that
// invalidates results computed by the previous logic.
const CACHE_VERSION = 1
const MAX_RESOLVED_ENTRIES = 200
const TRANSIENT_TTL_MS = 5_000
const STABLE_TTL_MS = 24 * 60 * 60_000

interface CatalogCacheSchema {
	entries: Record<string, CacheEntry>
}

export class Cache {
	private readonly conf: Conf<CatalogCacheSchema>

	constructor(private readonly clock: Clock) {
		this.conf = new Conf<CatalogCacheSchema>({
			name: "catalog-cache",
			defaults: { entries: {} },
		})
	}

	public get(key: string): CacheEntry | null {
		const entries = this.conf.get("entries")
		const entry = entries[key]
		if (!entry || entry.version !== CACHE_VERSION) {
			return null
		}

		if (entry.status === "unresolved" && entry.expiresAt <= this.clock.now()) {
			return null
		}

		entries[key] = { ...entry, lastAccessedAt: this.clock.now() }
		this.conf.set("entries", entries)
		return entries[key] ?? null
	}

	public setResolved(key: string, work: CachedWork): void {
		const entries = this.conf.get("entries")
		entries[key] = {
			status: "resolved",
			version: CACHE_VERSION,
			work,
			lastAccessedAt: this.clock.now(),
		}
		this.evictIfNeeded(entries)
		this.conf.set("entries", entries)
	}

	public setUnresolved(key: string, reason: UnresolvedReason): void {
		const entries = this.conf.get("entries")
		const ttl = reason === "provider-error" ? TRANSIENT_TTL_MS : STABLE_TTL_MS
		entries[key] = {
			status: "unresolved",
			version: CACHE_VERSION,
			expiresAt: this.clock.now() + ttl,
			lastAccessedAt: this.clock.now(),
		}
		this.conf.set("entries", entries)
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
