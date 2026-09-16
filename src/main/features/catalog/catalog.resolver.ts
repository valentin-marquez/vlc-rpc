import { logger } from "@main/core/logger"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Cache } from "./catalog.cache"
import { catalogKey } from "./catalog.key"
import { parse } from "./catalog.parser"
import { pickBest } from "./catalog.scorer"
import type {
	CachedWork,
	Candidate,
	CatalogProvider,
	CatalogResult,
	ParsedVideo,
} from "./catalog.types"

export class Resolver {
	private readonly inflight = new Map<string, Promise<CatalogResult | null>>()

	constructor(
		private readonly cache: Cache,
		private readonly anilist: CatalogProvider,
	) {}

	public async resolve(status: VlcStatus): Promise<CatalogResult | null> {
		if (status.mediaType !== "video" || !status.media.title) {
			return null
		}

		const parsed = parse(status.media.title)
		const key = catalogKey(parsed)

		const cached = this.cache.get(key)
		if (cached) {
			if (cached.status === "resolved") {
				return { ...cached.work, season: parsed.season, episode: parsed.episode }
			}
			return null
		}

		const existing = this.inflight.get(key)
		if (existing) {
			return existing
		}

		const promise = this.resolveUncached(parsed, key)
		this.inflight.set(key, promise)

		try {
			return await promise
		} finally {
			this.inflight.delete(key)
		}
	}

	private async resolveUncached(parsed: ParsedVideo, key: string): Promise<CatalogResult | null> {
		if (!parsed.title) {
			this.cache.setUnresolved(key, "parse-invalid")
			return null
		}

		const providers = this.providersFor(parsed.signal)
		if (providers.length === 0) {
			// Nothing was asked, so nothing failed. This is a stable "no source for
			// this yet", not an outage to retry on the next poll, so it takes the
			// same long TTL as a search that ran and came back empty.
			this.cache.setUnresolved(key, "no-results")
			return null
		}

		const { candidates, allFailed } = await this.searchProviders(providers, parsed)

		if (candidates.length === 0) {
			this.cache.setUnresolved(key, allFailed ? "provider-error" : "no-results")
			return null
		}

		const best = pickBest(parsed, candidates)
		if (!best) {
			this.cache.setUnresolved(key, "no-match")
			return null
		}

		const work: CachedWork = {
			title: best.title,
			poster: best.posterUrl,
			mediaKind: best.mediaKind,
		}
		this.cache.setResolved(key, work)
		return { ...work, season: parsed.season, episode: parsed.episode }
	}

	private async searchProviders(
		providers: CatalogProvider[],
		parsed: ParsedVideo,
	): Promise<{ candidates: Candidate[]; allFailed: boolean }> {
		const results = await Promise.allSettled(
			providers.map((provider) => provider.search(parsed.title)),
		)

		const candidates: Candidate[] = []
		let failures = 0
		for (const result of results) {
			if (result.status === "fulfilled") {
				candidates.push(...result.value)
			} else {
				failures++
				logger.warn(`Catalog provider search failed: ${result.reason}`)
			}
		}

		return { candidates, allFailed: failures === providers.length }
	}

	// The signal says which naming convention produced the filename, not what
	// kind of content it holds. "ambiguous" goes to AniList along with "fansub"
	// because anime is often named in the western style.
	private providersFor(signal: ParsedVideo["signal"]): CatalogProvider[] {
		// Western naming has no source today. AniList does not hold western film
		// or television, so asking it would spend a request that cannot succeed
		// and cache the miss. A keyless television provider is meant to fill this
		// route, which is why it is empty rather than pointed at AniList.
		if (signal === "western") return []
		return [this.anilist]
	}
}
