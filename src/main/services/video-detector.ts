import type { ContentMetadata, ContentType, EnhancedMediaInfo } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import * as cheerio from "cheerio"
import { logger } from "./logger"

/**
 * Service to analyze video content and detect its type and metadata
 */
export class VideoDetectorService {
	private static instance: VideoDetectorService | null = null

	private constructor() {
		logger.info("Video detector service initialized")
	}

	/**
	 * Get the singleton instance of the video detector service
	 */
	public static getInstance(): VideoDetectorService {
		if (!VideoDetectorService.instance) {
			VideoDetectorService.instance = new VideoDetectorService()
		}
		return VideoDetectorService.instance
	}

	/**
	 * Analyze video content to determine type and metadata
	 */
	public async analyze(mediaInfo: VlcStatus | null): Promise<VlcStatus & EnhancedMediaInfo> {
		if (!mediaInfo) {
			return {} as VlcStatus & EnhancedMediaInfo
		}

		const enhancedInfo = { ...mediaInfo } as VlcStatus & EnhancedMediaInfo
		const title = mediaInfo.media.title || ""

		if (!title) {
			return enhancedInfo
		}

		try {
			const [contentType, metadata] = this.detectContentType(title)
			enhancedInfo.content_type = contentType
			enhancedInfo.content_metadata = metadata

			const imageUrl = await this.fetchContentImage(title, contentType, metadata)
			if (imageUrl) {
				enhancedInfo.content_image_url = imageUrl
			}

			logger.info(`Detected content: ${contentType} - ${JSON.stringify(metadata)}`)
			return enhancedInfo
		} catch (error) {
			logger.error(`Error analyzing video: ${error}`)
			return enhancedInfo
		}
	}

	/**
	 * Detect content type and metadata from title
	 */
	private detectContentType(title: string): [ContentType, ContentMetadata] {
		const cleanTitle = this.cleanTitle(title)
		const metadata: ContentMetadata = {
			original_title: title,
			clean_title: cleanTitle,
		}

		// TV Show patterns
		const tvPatterns = [
			/(.*?)[\.\s_-]*S(\d{1,2})[\.\s_-]*E(\d{1,2})/i,
			/(.*?)[\.\s_-]*(\d{1,2})x(\d{1,2})/i,
			/(.*?)[\.\s_-]*Season[\.\s_-]*(\d{1,2})[\.\s_-]*Episode[\.\s_-]*(\d{1,2})/i,
		]

		for (const pattern of tvPatterns) {
			const match = cleanTitle.match(pattern)
			if (match) {
				const showName = match[1].replace(/[._-]/g, " ").trim()
				metadata.show_name = showName
				metadata.season = Number.parseInt(match[2], 10)
				metadata.episode = Number.parseInt(match[3], 10)
				return ["tv_show", metadata]
			}
		}

		// Movie pattern
		const moviePattern = /(.+?)[\.\s\[\(_-]+(19\d{2}|20\d{2})[\]\)\._\s-]/
		const movieMatch = cleanTitle.match(moviePattern)
		if (movieMatch) {
			const movieName = movieMatch[1].replace(/[._-]/g, " ").trim()
			metadata.movie_name = movieName
			metadata.year = movieMatch[2]
			return ["movie", metadata]
		}

		// Anime pattern
		if (
			(cleanTitle.includes("[") && cleanTitle.includes("]")) ||
			/\.(sub|dub)\./i.test(cleanTitle)
		) {
			const epMatch = cleanTitle.match(/[-\s\.\_](\d{1,3})[-\s\.\_]/)
			if (epMatch) {
				metadata.episode = Number.parseInt(epMatch[1], 10)
				const namePart = cleanTitle.split(epMatch[0])[0]
				const animeName = namePart.replace(/\[.*?\]|\(.*?\)|[._-]/g, " ").trim()
				metadata.anime_name = animeName
				return ["anime", metadata]
			}

			const animeName = cleanTitle.replace(/\[.*?\]|\(.*?\)|[._-]/g, " ").trim()
			metadata.anime_name = animeName
			return ["anime", metadata]
		}

		// Generic video
		const genericName = cleanTitle.replace(/\[.*?\]|\(.*?\)|\.mkv|\.mp4|\.avi|[._-]/g, " ").trim()
		metadata.title = genericName
		return ["video", metadata]
	}

	/**
	 * Clean title by removing file extensions and quality indicators
	 */
	private cleanTitle(title: string): string {
		let cleaned = title.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, "")
		cleaned = cleaned.replace(/(-[A-Za-z0-9]+|\d{3,4}p|x264|x265|HEVC|WEB-DL|BluRay|WEBRip)$/i, "")
		return cleaned
	}

	/**
	 * Fetch a cover image for the content
	 */
	private async fetchContentImage(
		title: string,
		contentType: ContentType,
		metadata: ContentMetadata,
	): Promise<string | null> {
		let searchTerm = ""

		if (contentType === "tv_show" && metadata.show_name) {
			searchTerm = `${metadata.show_name} tv show poster`
		} else if (contentType === "movie" && metadata.movie_name) {
			if (metadata.year) {
				searchTerm = `${metadata.movie_name} ${metadata.year} movie poster`
			} else {
				searchTerm = `${metadata.movie_name} movie poster`
			}
		} else if (contentType === "anime" && metadata.anime_name) {
			searchTerm = `${metadata.anime_name} anime cover`
		} else {
			searchTerm = `${title} cover`
		}

		return this.fetchImageFromGoogle(searchTerm)
	}

	/**
	 * Fetch image from Google Images based on search term
	 */
	private async fetchImageFromGoogle(searchTerm: string): Promise<string | null> {
		try {
			logger.info(`Searching for image: ${searchTerm}`)
			const encodedQuery = encodeURIComponent(searchTerm)
			const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch`

			const response = await fetch(searchUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
					Accept: "text/html,application/xhtml+xml",
				},
			})

			if (!response.ok) {
				return null
			}

			const html = await response.text()
			const $ = cheerio.load(html)

			// Try to find image URLs in the page
			let imageUrl: string | null = null

			// First check <img> tags
			$("img").each((_, img) => {
				const src = $(img).attr("src")
				if (src?.startsWith("http") && !src.endsWith(".gif")) {
					if (src.includes("gstatic.com")) {
						imageUrl = src
						return false // break the loop
					}
				}
				return true // continue the loop
			})

			if (imageUrl) {
				return imageUrl
			}

			// Then try to extract from scripts
			const imgRegex = /https?:\/\/\S+?\.(?:jpg|jpeg|png)/g
			$("script").each((_, script) => {
				const content = $(script).html()
				if (content?.includes("AF_initDataCallback")) {
					const matches = content.match(imgRegex)
					if (matches) {
						for (const url of matches) {
							if (!/icon|emoji|favicon/i.test(url)) {
								imageUrl = url
								return false // break the loop
							}
						}
					}
				}
				return true // continue the loop
			})

			return imageUrl
		} catch (error) {
			logger.error(`Error fetching image: ${error}`)
			return null
		}
	}
}

export const videoDetectorService = VideoDetectorService.getInstance()
