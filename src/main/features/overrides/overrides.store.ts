import type { Clock } from "@main/core/clock"
import { Conf } from "electron-conf/main"
import type { Override, OverrideEntry, OverrideInput } from "./overrides.types"

interface OverridesSchema {
	entries: Record<string, Override>
}

/**
 * The keys come from the same builders the caches use, and `catalogKey` is pure:
 * it never sees the resolver's guard against an empty parsed title, so a file
 * whose name cannot be parsed yields the key `video:` exactly. In a cache that
 * key can only ever hold a negative result, but an override under it would
 * become the title and the cover of every unparseable file the user plays. That
 * is the one way this feature can produce a confidently wrong answer, so the
 * check lives in the store's only write path rather than in a caller that could
 * forget it, and the read path honors it too in case an older build or a hand
 * edited file left such a row behind.
 */
function hasIdentity(key: string): boolean {
	const separator = key.indexOf(":")
	if (separator <= 0) return false
	const identity = key.slice(separator + 1).split("|")[0] ?? ""
	return identity.trim().length > 0
}

/**
 * No LRU, no TTL and no version counter, unlike the two caches next door. A
 * cache holds what it can recompute, so discarding an entry costs a request.
 * This holds what the user typed by hand, which cannot be recovered from
 * anywhere. The only thing that removes an override is the user.
 */
export class Store {
	private readonly conf: Conf<OverridesSchema>

	constructor(private readonly clock: Clock) {
		this.conf = new Conf<OverridesSchema>({
			name: "overrides",
			defaults: { entries: {} },
		})
	}

	public get(key: string): Override | null {
		if (!hasIdentity(key)) return null
		return this.conf.get("entries")[key] ?? null
	}

	public save(key: string, input: OverrideInput): void {
		if (!hasIdentity(key)) {
			throw new Error(
				`Refusing to save an override under "${key}": the key carries no title, so it would apply to every file whose name cannot be parsed.`,
			)
		}

		const entries = this.conf.get("entries")
		entries[key] = { ...input, savedAt: this.clock.now() }
		this.conf.set("entries", entries)
	}

	public delete(key: string): void {
		const entries = this.conf.get("entries")
		if (!(key in entries)) return
		delete entries[key]
		this.conf.set("entries", entries)
	}

	public list(): OverrideEntry[] {
		return Object.entries(this.conf.get("entries")).map(([key, override]) => ({ key, override }))
	}
}
