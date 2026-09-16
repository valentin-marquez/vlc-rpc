import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { OverrideDraft, OverrideSaveResult } from "@shared/ipc/channels"
import type { OverrideEntry, OverrideInput } from "./overrides.types"

const COVER_TIMEOUT_MS = 5000

/**
 * The slice of the store these channels touch. Declaring it lets a test hand
 * the handler a double instead of opening a Conf, and `Store` satisfies it as
 * it stands.
 */
export interface OverridesStore {
	list(): OverrideEntry[]
	save(key: string, input: OverrideInput): void
	delete(key: string): void
}

/**
 * A feature that caches answers for the identities these keys name. The
 * resolvers implement it: each one owns its cache and is the only place that
 * knows how an override key relates to the keys that cache holds, which for
 * audio is not a lookup at all. What they cannot know is that a correction was
 * typed, so the call is made from here, the one place a save and a delete both
 * pass through.
 */
export interface OverrideEvictor {
	evictOverride(key: string): void
}

// The abort timer has to cover reading the body too: a host can answer with
// image/png and then stall, and clearing the timer once the headers arrive
// would leave that unbounded.
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), COVER_TIMEOUT_MS)

	try {
		return await run(controller.signal)
	} finally {
		clearTimeout(timeoutId)
	}
}

function isHttpUrl(value: string): boolean {
	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		return false
	}
	return parsed.protocol === "http:" || parsed.protocol === "https:"
}

/**
 * `null` when the URL is a cover that actually loads. Anything else is the
 * reason to hand back untouched: a wrong cover is a broken image the user
 * believes they fixed, and they only find out the next time they play the file.
 */
async function checkCover(url: string): Promise<OverrideSaveResult | null> {
	if (!isHttpUrl(url)) {
		return { saved: false, reason: "cover-not-a-url" }
	}

	try {
		return await withTimeout<OverrideSaveResult | null>(async (signal) => {
			const response = await fetch(url, { signal })

			// A dead link does answer, but with nothing to show. It calls for the
			// same move as a host that never answers at all: check the link.
			if (!response.ok) {
				return { saved: false, reason: "cover-unreachable", status: response.status }
			}

			const contentType = response.headers.get("content-type")
			if (!contentType?.toLowerCase().startsWith("image/")) {
				return { saved: false, reason: "cover-not-an-image", contentType }
			}

			// Draining the body is the only part that proves the image arrives. A
			// declared content type is a promise, not a delivery.
			const body = await response.arrayBuffer()
			if (body.byteLength === 0) {
				return { saved: false, reason: "cover-not-an-image", contentType }
			}

			return null
		})
	} catch (error) {
		// Never the error itself and never the URL: a failed request carries the
		// address it was made against, and the user pasted that address.
		const name = error instanceof Error ? error.name : "unknown error"
		logger.warn(`Override cover check failed: ${name}`)
		return { saved: false, reason: "cover-unreachable", status: null }
	}
}

/**
 * The bridge the Settings screen calls to see, add and drop the corrections the
 * user typed by hand.
 */
export class Handler {
	constructor(
		private readonly store: OverridesStore,
		private readonly evictors: readonly OverrideEvictor[],
	) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("overrides:list", () => this.store.list())

		registerHandler("overrides:save", async (key, draft) => {
			return await this.save(key, draft)
		})

		registerHandler("overrides:delete", (key) => {
			this.store.delete(key)
			// A delete has to evict too, and for the same reason a save does. The
			// entry cached before the correction has no TTL, so leaving it behind is
			// what would make the answer the user rejected come back.
			this.evict(key)
			logger.info("Deleted an override")
			return true
		})
	}

	private evict(key: string): void {
		for (const evictor of this.evictors) {
			evictor.evictOverride(key)
		}
	}

	private async save(key: string, draft: OverrideDraft): Promise<OverrideSaveResult> {
		if (draft.cover !== undefined) {
			const failure = await checkCover(draft.cover)
			if (failure) {
				return failure
			}
		}

		try {
			this.store.save(key, draft)
		} catch (error) {
			// The store refuses a key with no title in it, which would otherwise
			// become the answer for every file whose name cannot be parsed. That
			// guard belongs there; reaching the renderer as a rejected invoke is
			// what has to be avoided here.
			const name = error instanceof Error ? error.name : "unknown error"
			logger.warn(`Override save refused by the store: ${name}`)
			return { saved: false, reason: "store-refused" }
		}

		this.evict(key)
		logger.info("Saved an override", { kind: draft.kind, hasCover: draft.cover !== undefined })
		return { saved: true }
	}
}
