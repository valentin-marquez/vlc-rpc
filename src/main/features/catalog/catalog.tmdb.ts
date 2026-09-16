import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Candidate, CatalogProvider } from "./catalog.types"

interface TmdbTvResult {
	id: number
	name: string
	original_name: string
	first_air_date: string
	poster_path: string | null
}

interface TmdbMovieResult {
	id: number
	title: string
	original_title: string
	release_date: string
	poster_path: string | null
}

const BASE_URL = "https://api.themoviedb.org/3"
const POSTER_BASE = "https://image.tmdb.org/t/p/w500"
const REQUEST_TIMEOUT_MS = 5000

export class TmdbProvider implements CatalogProvider {
	public async search(query: string): Promise<Candidate[]> {
		const apiKey = configService.get("tmdbApiKey")
		// Not a failure: TMDB is simply switched off, so it reports zero results.
		if (!apiKey) {
			return []
		}

		const [tv, movies] = await Promise.all([
			this.searchTv(query, apiKey),
			this.searchMovies(query, apiKey),
		])

		// Only a total failure is worth reporting as such: half a search still
		// gives the scorer something to work with.
		if (tv === null && movies === null) {
			throw new Error("TMDB search failed: both the tv and the movie search failed")
		}

		return [...(tv ?? []), ...(movies ?? [])]
	}

	// null means the search could not run, an empty array means it ran and found nothing.
	private async searchTv(query: string, apiKey: string): Promise<Candidate[] | null> {
		try {
			const url = `${BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`
			const response = await this.fetchWithTimeout(url)
			if (!response.ok) {
				logger.warn(`TMDB tv search failed: HTTP ${response.status}`)
				return null
			}

			const body = (await response.json()) as { results: TmdbTvResult[] }
			return body.results.map((result) => this.normalizeTv(result))
		} catch (error) {
			logger.warn(`TMDB tv search failed: ${error}`)
			return null
		}
	}

	private async searchMovies(query: string, apiKey: string): Promise<Candidate[] | null> {
		try {
			const url = `${BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`
			const response = await this.fetchWithTimeout(url)
			if (!response.ok) {
				logger.warn(`TMDB movie search failed: HTTP ${response.status}`)
				return null
			}

			const body = (await response.json()) as { results: TmdbMovieResult[] }
			return body.results.map((result) => this.normalizeMovie(result))
		} catch (error) {
			logger.warn(`TMDB movie search failed: ${error}`)
			return null
		}
	}

	private async fetchWithTimeout(url: string): Promise<Response> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			return await fetch(url, { signal: controller.signal })
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private normalizeTv(result: TmdbTvResult): Candidate {
		const year = result.first_air_date ? Number(result.first_air_date.slice(0, 4)) : undefined
		return {
			provider: "tmdb",
			id: String(result.id),
			title: result.name,
			aliases: result.original_name !== result.name ? [result.original_name] : [],
			year,
			mediaKind: "tv",
			posterUrl: result.poster_path ? `${POSTER_BASE}${result.poster_path}` : null,
		}
	}

	private normalizeMovie(result: TmdbMovieResult): Candidate {
		const year = result.release_date ? Number(result.release_date.slice(0, 4)) : undefined
		return {
			provider: "tmdb",
			id: String(result.id),
			title: result.title,
			aliases: result.original_title !== result.title ? [result.original_title] : [],
			year,
			mediaKind: "movie",
			posterUrl: result.poster_path ? `${POSTER_BASE}${result.poster_path}` : null,
		}
	}
}
