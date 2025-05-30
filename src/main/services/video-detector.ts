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

		// Enhanced TV show patterns with more variations
		const tvPatterns = [
			// Standard patterns
			/(.*?)[\.\s_-]*S(\d{1,2})[\.\s_-]*E(\d{1,2})/i,
			/(.*?)[\.\s_-]*(\d{1,2})x(\d{1,2})/i,
			/(.*?)[\.\s_-]*Season[\.\s_-]*(\d{1,2})[\.\s_-]*Episode[\.\s_-]*(\d{1,2})/i,
			// New patterns for better detection
			/(.*?)[\.\s_-]*S(\d{1,2})E(\d{1,2})/i, // S01E01 without separators
			/(.*?)[\.\s_-]*(\d{1,2})\.(\d{1,2})/i, // 1.01 format
			/(.*?)[\.\s_-]*Ep[\.\s_-]*(\d{1,3})/i, // Episode 01
			/(.*?)[\.\s_-]*Episode[\.\s_-]*(\d{1,3})/i, // Episode 01
			// Spanish patterns
			/(.*?)[\.\s_-]*Temporada[\.\s_-]*(\d{1,2})[\.\s_-]*Capitulo[\.\s_-]*(\d{1,2})/i,
			/(.*?)[\.\s_-]*T(\d{1,2})[\.\s_-]*C(\d{1,2})/i, // T01C01
		]

		for (const pattern of tvPatterns) {
			const match = cleanTitle.match(pattern)
			if (match) {
				const showName = match[1].replace(/[._-]/g, " ").trim()
				metadata.show_name = showName

				// Handle different pattern groups
				if (match.length >= 4) {
					metadata.season = Number.parseInt(match[2], 10)
					metadata.episode = Number.parseInt(match[3], 10)
				} else if (match.length === 3) {
					// Single episode number pattern
					metadata.episode = Number.parseInt(match[2], 10)
				}

				logger.info(
					`Detected TV show: ${showName} S${metadata.season || 0}E${metadata.episode || 0}`,
				)
				return ["tv_show", metadata]
			}
		}

		// Enhanced movie detection with more patterns
		const moviePatterns = [
			// Year in parentheses or brackets
			/(.+?)[\.\s\[\(_-]+(19\d{2}|20\d{2})[\]\)\._\s-]/,
			// Year at the end
			/(.+?)[\.\s_-]+(19\d{2}|20\d{2})$/,
			// Quality indicators usually mean movies
			/(.+?)[\.\s_-]+\b(BluRay|BRRip|DVDRip|WEBRip|WEB-DL|HDRip|CAMRip)\b/i,
			// Resolution indicators
			/(.+?)[\.\s_-]+\b(720p|1080p|2160p|4K|UHD)\b/i,
		]

		for (const pattern of moviePatterns) {
			const movieMatch = cleanTitle.match(pattern)
			if (movieMatch) {
				const movieName = movieMatch[1].replace(/[._-]/g, " ").trim()
				metadata.movie_name = movieName

				// Try to extract year from the match
				const yearMatch = movieMatch[0].match(/(19\d{2}|20\d{2})/)
				if (yearMatch) {
					metadata.year = yearMatch[1]
				}

				logger.info(`Detected movie: ${movieName} (${metadata.year || "unknown year"})`)
				return ["movie", metadata]
			}
		}

		// Enhanced anime detection
		const animePatterns = [
			// Brackets with fansub groups
			/\[([^\]]+)\][\s_-]*(.+?)[\s_-]*(\d{1,3})/i,
			// Episode patterns for anime
			/(.+?)[\s_-]+(\d{1,3})[\s_-]*\[/i,
			/(.+?)[\s_-]+Ep[\s_-]*(\d{1,3})/i,
			/(.+?)[\s_-]+Episode[\s_-]*(\d{1,3})/i,
		]

		for (const pattern of animePatterns) {
			const match = cleanTitle.match(pattern)
			if (
				(match && cleanTitle.includes("[") && cleanTitle.includes("]")) ||
				/\.(sub|dub)\./i.test(cleanTitle)
			) {
				let animeName = ""
				let episode = 0

				if (match && match.length >= 4) {
					// Fansub group pattern
					animeName = match[2].replace(/[._-]/g, " ").trim()
					episode = Number.parseInt(match[3], 10)
				} else if (match && match.length >= 3) {
					// Direct episode pattern
					animeName = match[1].replace(/[._-]/g, " ").trim()
					episode = Number.parseInt(match[2], 10)
				}

				if (animeName) {
					metadata.anime_name = animeName
					metadata.episode = episode
					logger.info(`Detected anime: ${animeName} - Episode ${episode}`)
					return ["anime", metadata]
				}
			}
		}

		// If no specific pattern matches, check for video indicators
		const videoIndicators = [
			/\b(mkv|mp4|avi|mov|wmv|flv|webm|m4v)\b/i,
			/\b(x264|x265|HEVC|h264|h265)\b/i,
			/\b(AAC|AC3|DTS|TrueHD)\b/i, // Audio codecs often in video files
		]

		const hasVideoIndicators = videoIndicators.some((pattern) => pattern.test(cleanTitle))

		if (hasVideoIndicators) {
			const genericName = cleanTitle.replace(/\[.*?\]|\(.*?\)|\.mkv|\.mp4|\.avi|[._-]/g, " ").trim()
			metadata.title = genericName
			logger.info(`Detected generic video: ${genericName}`)
			return ["video", metadata]
		}

		// Default to generic title
		const genericName = cleanTitle.replace(/\[.*?\]|\(.*?\)|\.mkv|\.mp4|\.avi|[._-]/g, " ").trim()
		metadata.title = genericName
		logger.info(`No specific pattern detected, using generic: ${genericName}`)
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

			let imageUrl: string | null = null

			$("img").each((_, img) => {
				const src = $(img).attr("src")
				if (src?.startsWith("http") && !src.endsWith(".gif")) {
					if (src.includes("gstatic.com")) {
						imageUrl = src
						return false
					}
				}
				return true
			})

			if (imageUrl) {
				return imageUrl
			}

			const imgRegex = /https?:\/\/\S+?\.(?:jpg|jpeg|png)/g
			$("script").each((_, script) => {
				const content = $(script).html()
				if (content?.includes("AF_initDataCallback")) {
					const matches = content.match(imgRegex)
					if (matches) {
						for (const url of matches) {
							if (!/icon|emoji|favicon/i.test(url)) {
								imageUrl = url
								return false
							}
						}
					}
				}
				return true
			})

			return imageUrl
		} catch (error) {
			logger.error(`Error fetching image: ${error}`)
			return null
		}
	}
}

export const videoDetectorService = VideoDetectorService.getInstance()
