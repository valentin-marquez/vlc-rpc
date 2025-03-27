import { createHash } from "node:crypto"
import type { VlcStatus } from "@shared/types/vlc"
import { logger } from "./logger"

interface CachedCoverArt {
	url: string | null
	timestamp: number
}

/** Media data structure for cover art searching */
interface MediaData {
	title?: string
	artist?: string
	album?: string
	artworkUrl?: string
	date?: string
	year?: string
	[key: string]: string | undefined
}

/** MusicBrainz artist credit object */
interface ArtistCredit {
	name?: string
	artist?: {
		aliases?: Array<{ name?: string }>
	}
}

/** MusicBrainz release object */
interface MusicBrainzRelease {
	id: string
	title?: string
	score?: number
	date?: string
	status?: string
	"artist-credit"?: ArtistCredit[]
	"release-group"?: {
		"secondary-types"?: string[]
		"secondary-type-ids"?: string[]
	}
}

/** MusicBrainz recording object */
interface MusicBrainzRecording {
	id: string
	title?: string
	score?: number
	"artist-credit"?: ArtistCredit[]
	releases?: MusicBrainzRelease[]
}

/** Scored release result */
interface ScoredRelease {
	score: number
	release_id: string
	release_title: string
	artist: string
}

/** Service to fetch album cover art for audio files */
export class CoverArtService {
	private static instance: CoverArtService | null = null
	private cache: Record<string, CachedCoverArt> = {}
	private cacheTtl = 3600 // 1 hour

	private constructor() {
		logger.info("Cover art service initialized")
	}

	/** Get the singleton instance of the cover art service */
	public static getInstance(): CoverArtService {
		if (!CoverArtService.instance) {
			CoverArtService.instance = new CoverArtService()
		}
		return CoverArtService.instance
	}

	/** Fetch cover art URL using all available media information */
	public async fetch(mediaInfo: VlcStatus | null): Promise<string | null> {
		const media = this.extractMediaData(mediaInfo)
		if (!media) {
			return null
		}

		const cacheKey = this.createCacheKey(media)
		if (cacheKey && cacheKey in this.cache) {
			const cachedResult = this.cache[cacheKey]
			if (Date.now() / 1000 - cachedResult.timestamp < this.cacheTtl) {
				logger.info(`Using cached cover art URL: ${cachedResult.url}`)
				return cachedResult.url
			}
		}

		const coverUrl = await this.fetchFromMusicBrainz(media)

		if (cacheKey) {
			this.cache[cacheKey] = {
				url: coverUrl,
				timestamp: Math.floor(Date.now() / 1000),
			}
		}

		return coverUrl
	}

	/** Extract media data from the input */
	private extractMediaData(mediaInfo: VlcStatus | null): MediaData | null {
		if (!mediaInfo || typeof mediaInfo !== "object") {
			logger.info("No valid media info provided for cover art")
			return null
		}

		return mediaInfo.media as MediaData
	}

	/** Create a unique cache key based on media information */
	private createCacheKey(media: MediaData): string | null {
		if (!media) {
			return null
		}

		const keyParts: string[] = []
		for (const field of ["artist", "album", "title"]) {
			if (media[field]) {
				keyParts.push(`${field}:${media[field]}`)
			}
		}

		if (keyParts.length === 0) {
			return null
		}

		return createHash("md5").update(keyParts.join("|")).digest("hex")
	}

	/** Build query for MusicBrainz search */
	private buildQuery(media: MediaData): string | null {
		if (media.artist && media.title && media.album) {
			return `${media.title} AND artist:${media.artist} AND release:"${media.album}"`
		}

		if (media.artist && media.title) {
			return `${media.title} AND artist:${media.artist}`
		}

		if (media.artist && media.album) {
			return `artist:"${media.artist}" AND release:"${media.album}"`
		}

		if (media.album) {
			return `release:"${media.album}"`
		}

		if (media.artist) {
			return `artist:"${media.artist}"`
		}

		if (media.title) {
			return `recording:"${media.title}"`
		}

		logger.info("Insufficient media information for cover art search")
		return null
	}

	/** Fetch cover art from MusicBrainz */
	private async fetchFromMusicBrainz(media: MediaData): Promise<string | null> {
		try {
			const query = this.buildQuery(media)
			if (!query) {
				return null
			}

			if (media.album && (media.artist || media.title)) {
				const url = await this.searchReleases(query, media)
				if (url) {
					return url
				}
			}

			if (media.title && media.artist) {
				const url = await this.searchRecordings(query, media)
				if (url) {
					return url
				}
			}

			const fallbackQuery = this.buildFallbackQuery(media)
			if (fallbackQuery && fallbackQuery !== query) {
				logger.info(`Trying fallback search: ${fallbackQuery}`)
				const url = await this.searchReleases(fallbackQuery, media)
				if (url) {
					return url
				}
			}

			return null
		} catch (error) {
			logger.error(`Error in MusicBrainz lookup: ${error}`)
			return null
		}
	}

	/** Build a fallback query with less constraints */
	private buildFallbackQuery(media: MediaData): string | null {
		if (media.artist && media.title) {
			return `artist:"${media.artist}"`
		}
		return null
	}

	/** Search for releases and get the best match */
	private async searchReleases(query: string, media: MediaData): Promise<string | null> {
		logger.info(`Searching MusicBrainz releases with: ${query}`)

		const searchUrl = "https://musicbrainz.org/ws/2/release"
		const params = new URLSearchParams({
			query,
			fmt: "json",
			limit: "10",
		})

		const response = await this.makeRequest(`${searchUrl}?${params}`)
		if (!response) {
			return null
		}

		return this.processReleaseResponse(response, media)
	}

	/** Search for recordings and get the best match */
	private async searchRecordings(query: string, media: MediaData): Promise<string | null> {
		logger.info(`Searching MusicBrainz recordings with: ${query}`)

		const searchUrl = "https://musicbrainz.org/ws/2/recording"
		const params = new URLSearchParams({
			query,
			fmt: "json",
			limit: "10",
		})

		const response = await this.makeRequest(`${searchUrl}?${params}`)
		if (!response) {
			return null
		}

		return this.processRecordingResponse(response, media)
	}

	/** Process MusicBrainz recording response and extract cover URL */
	private async processRecordingResponse(
		response: Response,
		media: MediaData,
	): Promise<string | null> {
		try {
			const data = (await response.json()) as { recordings?: MusicBrainzRecording[] }

			if (!data.recordings || data.recordings.length === 0) {
				logger.info("No recordings found in MusicBrainz response")
				return null
			}

			const scoredReleases: ScoredRelease[] = []

			for (const recording of data.recordings) {
				if (!recording.releases || recording.releases.length === 0) {
					continue
				}

				for (const release of recording.releases) {
					const score = this.calculateReleaseScore(recording, release, media)
					scoredReleases.push({
						score,
						release_id: release.id,
						release_title: release.title || "",
						artist: recording["artist-credit"]?.[0] ? recording["artist-credit"][0].name || "" : "",
					})
				}
			}

			scoredReleases.sort((a, b) => b.score - a.score)

			for (const releaseInfo of scoredReleases) {
				if (releaseInfo.score < 30) {
					continue
				}

				logger.info(
					`Trying release: '${releaseInfo.release_title}' by '${releaseInfo.artist}' (score: ${releaseInfo.score})`,
				)

				const coverUrl = `https://coverartarchive.org/release/${releaseInfo.release_id}/front-500`
				const headResponse = await this.makeRequest(coverUrl, "HEAD")

				if (headResponse) {
					logger.info(`Found cover art: ${coverUrl}`)
					return coverUrl
				}
			}

			logger.info("No suitable cover art found for recording")
			return null
		} catch (error) {
			logger.error(`Error processing recording response: ${error}`)
			return null
		}
	}

	/** Process MusicBrainz release response and extract cover URL */
	private async processReleaseResponse(
		response: Response,
		media: MediaData,
	): Promise<string | null> {
		try {
			const data = (await response.json()) as { releases?: MusicBrainzRelease[] }

			if (!data.releases || data.releases.length === 0) {
				logger.info("No releases found in MusicBrainz response")
				return null
			}

			const scoredReleases: ScoredRelease[] = []

			for (const release of data.releases) {
				const score = this.calculateReleaseScore(null, release, media)
				scoredReleases.push({
					score,
					release_id: release.id,
					release_title: release.title || "",
					artist: release["artist-credit"]?.[0] ? release["artist-credit"][0].name || "" : "",
				})
			}

			scoredReleases.sort((a, b) => b.score - a.score)

			for (const releaseInfo of scoredReleases) {
				if (releaseInfo.score < 30) {
					continue
				}

				logger.info(
					`Trying release: '${releaseInfo.release_title}' by '${releaseInfo.artist}' (score: ${releaseInfo.score})`,
				)

				const coverUrl = `https://coverartarchive.org/release/${releaseInfo.release_id}/front-500`
				const headResponse = await this.makeRequest(coverUrl, "HEAD")

				if (headResponse) {
					logger.info(`Found cover art: ${coverUrl}`)
					return coverUrl
				}
			}

			logger.info("No suitable cover art found for releases")
			return null
		} catch (error) {
			logger.error(`Error processing release response: ${error}`)
			return null
		}
	}

	/** Calculate a match score for a release based on our metadata */
	private calculateReleaseScore(
		recording: MusicBrainzRecording | null,
		release: MusicBrainzRelease,
		media: MediaData,
	): number {
		let score = 0

		const baseScore = recording ? recording.score : release.score || 0
		score += Math.min(baseScore || 0, 100)

		if (media.artist) {
			const artistNames: string[] = []
			const artistCredit = release["artist-credit"] || []

			for (const credit of artistCredit) {
				if (typeof credit === "object" && credit !== null) {
					if (credit.name) {
						artistNames.push(credit.name.toLowerCase())
					}

					if (credit.artist?.aliases) {
						for (const alias of credit.artist.aliases) {
							if (typeof alias === "object" && alias !== null && alias.name) {
								artistNames.push(alias.name.toLowerCase())
							}
						}
					}
				}
			}

			const mediaArtist = media.artist.toLowerCase()
			if (artistNames.some((name) => this.fuzzyMatch(mediaArtist, name))) {
				score += 100
			} else if (
				artistNames.some((name) => mediaArtist.includes(name) || name.includes(mediaArtist))
			) {
				score += 70
			}
		}

		if (media.album && release.title) {
			const mediaAlbum = media.album.toLowerCase()
			const releaseTitle = release.title.toLowerCase()

			if (this.fuzzyMatch(mediaAlbum, releaseTitle)) {
				score += 100
			} else if (mediaAlbum.includes(releaseTitle) || releaseTitle.includes(mediaAlbum)) {
				score += 70
			}
		}

		if (media.title && recording && recording.title) {
			const mediaTitle = media.title.toLowerCase()
			const recordingTitle = recording.title.toLowerCase()

			if (this.fuzzyMatch(mediaTitle, recordingTitle)) {
				score += 80
			} else if (mediaTitle.includes(recordingTitle) || recordingTitle.includes(mediaTitle)) {
				score += 50
			}
		}

		if (media.date || media.year) {
			const mediaYear = String(media.date || media.year).substring(0, 4)
			const releaseDate = release.date || ""

			if (releaseDate?.startsWith(mediaYear)) {
				score += 40
			}
		}

		if (release.status === "Official") {
			score += 30
		}

		let secondaryTypes: string[] = []
		if (release["release-group"]?.["secondary-types"]) {
			secondaryTypes = release["release-group"]["secondary-types"]
		} else if (release["release-group"]?.["secondary-type-ids"]) {
			const hasSecondary = Boolean(release["release-group"]["secondary-type-ids"].length)
			if (hasSecondary) {
				score -= 20
			}
		}

		if (secondaryTypes.includes("Compilation")) {
			score -= 15
		}
		if (secondaryTypes.includes("Live")) {
			score -= 25
		}
		if (secondaryTypes.includes("Remix")) {
			score -= 20
		}

		return Math.max(0, score)
	}

	/** Simple fuzzy matching for strings */
	private fuzzyMatch(str1: string, str2: string): boolean {
		const s1 = str1.toLowerCase().replace(/[^\w\s]/g, "")
		const s2 = str2.toLowerCase().replace(/[^\w\s]/g, "")

		if (s1 === s2) {
			return true
		}

		if (s1.length > 5 && s2.length > 5) {
			if (s1.includes(s2) || s2.includes(s1)) {
				return true
			}
		}

		return false
	}

	/** Make an HTTP request with proper error handling */
	private async makeRequest(url: string, method = "GET"): Promise<Response | null> {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 3000)

			const response = await fetch(url, {
				method,
				headers: {
					"User-Agent": "VLC-Discord-RP/3.0 (https://github.com/valeriko777/vlc-discord-rp)",
				},
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (response.ok) {
				return response
			}
			logger.info(`API request failed: ${url} - Status ${response.status}`)
			return null
		} catch (error: unknown) {
			if (error instanceof Error && error.name === "AbortError") {
				logger.info("Request timed out")
			} else {
				logger.info(`Request failed: ${error}`)
			}
			return null
		}
	}
}

export const coverArtService = CoverArtService.getInstance()
