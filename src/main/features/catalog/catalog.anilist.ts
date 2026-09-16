import { logger } from "@main/core/logger"
import type { Candidate, CatalogProvider } from "./catalog.types"

const ENDPOINT = "https://graphql.anilist.co"
const MIN_INTERVAL_MS = 250
const REQUEST_TIMEOUT_MS = 5000

const QUERY = `
	query ($search: String) {
		Page(page: 1, perPage: 5) {
			media(search: $search, type: ANIME) {
				id
				title { romaji english native }
				synonyms
				startDate { year }
				format
				coverImage { large }
			}
		}
	}
`

interface AniListMedia {
	id: number
	title: { romaji: string | null; english: string | null; native: string | null }
	synonyms: string[]
	startDate: { year: number | null }
	format: string
	coverImage: { large: string | null }
}

export class AniListProvider implements CatalogProvider {
	private lastRequestAt = 0

	// Throws on failure: the resolver reads that as "could not search" (short cache TTL),
	// which is not the same answer as "searched fine, found nothing".
	public async search(query: string): Promise<Candidate[]> {
		await this.throttle()

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: QUERY, variables: { search: query } }),
				signal: controller.signal,
			})
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			const body = (await response.json()) as { data: { Page: { media: AniListMedia[] } } }
			return body.data.Page.media.map((media) => this.normalize(media))
		} catch (error) {
			logger.warn(`AniList search failed: ${error}`)
			throw error
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private async throttle(): Promise<void> {
		const wait = MIN_INTERVAL_MS - (Date.now() - this.lastRequestAt)
		if (wait > 0) {
			await new Promise((resolve) => setTimeout(resolve, wait))
		}
		this.lastRequestAt = Date.now()
	}

	private normalize(media: AniListMedia): Candidate {
		const primary = media.title.romaji ?? media.title.english ?? media.title.native ?? "Unknown"
		const aliases = [media.title.english, media.title.native, ...media.synonyms].filter(
			(title): title is string => Boolean(title) && title !== primary,
		)

		return {
			provider: "anilist",
			id: String(media.id),
			title: primary,
			aliases,
			year: media.startDate.year ?? undefined,
			mediaKind: media.format === "MOVIE" ? "movie" : "tv",
			posterUrl: media.coverImage.large ?? null,
		}
	}
}
