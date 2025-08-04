import type { VlcStatus } from "@shared/types/vlc"
import { logger } from "./logger"

// Import types from the ESM module
type ParsedFilename = import("@ctrl/video-filename-parser").ParsedFilename
type ParsedShow = import("@ctrl/video-filename-parser").ParsedShow

export interface VideoAnalysis {
	isVideo: boolean
	isTvShow: boolean
	isMovie: boolean
	title: string
	season?: number
	episode?: number
	year?: string
	duration?: number
	originalFilename?: string
}

/**
 * Check if parsed result is a TV show
 */
function isParsedShow(parsed: ParsedFilename): parsed is ParsedShow {
	return "isTv" in parsed && parsed.isTv === true
}

/**
 * Service to analyze video content and determine its type (TV show, movie, etc.)
 */
export class VideoAnalyzerService {
	private static instance: VideoAnalyzerService | null = null
	private filenameParse: ((filename: string, isTv?: boolean) => ParsedFilename) | null = null

	private constructor() {
		logger.info("Video analyzer service initialized")
		this.initializeParser()
	}

	/**
	 * Initialize the filename parser with dynamic import
	 */
	private async initializeParser(): Promise<void> {
		try {
			const module = await import("@ctrl/video-filename-parser")
			this.filenameParse = module.filenameParse
			logger.info("Video filename parser initialized")
		} catch (error) {
			logger.error("Failed to initialize video filename parser:", error)
		}
	}

	/**
	 * Get the singleton instance of the video analyzer service
	 */
	public static getInstance(): VideoAnalyzerService {
		if (!VideoAnalyzerService.instance) {
			VideoAnalyzerService.instance = new VideoAnalyzerService()
		}
		return VideoAnalyzerService.instance
	}

	/**
	 * Analyze video content to determine type and metadata
	 */
	public analyzeVideo(vlcStatus: VlcStatus, filename?: string): VideoAnalysis {
		if (vlcStatus.mediaType !== "video") {
			return {
				isVideo: false,
				isTvShow: false,
				isMovie: false,
				title: vlcStatus.media.title || "Unknown",
			}
		}

		const title = vlcStatus.media.title || ""
		const duration = vlcStatus.playback?.duration || 0
		const actualFilename = filename || title

		logger.info(`Analyzing video: "${actualFilename}" with duration: ${duration}s`)

		// First, let's try to determine if it's a TV show based on duration heuristics
		const durationMinutes = duration / 60
		let likelyTvShow = false

		// TV show episodes are typically 20-90 minutes
		// Movies are typically 90+ minutes
		if (durationMinutes > 0 && durationMinutes < 90) {
			likelyTvShow = true
			logger.info(`Duration ${durationMinutes.toFixed(1)} minutes suggests TV show`)
		}

		// Parse filename to get detailed information
		let parsedInfo: ParsedFilename | null = null
		let isTvShow = false

		if (actualFilename && this.filenameParse) {
			try {
				// First try parsing as TV show
				parsedInfo = this.filenameParse(actualFilename, true)
				logger.info(`Parsed as TV show: ${JSON.stringify(parsedInfo)}`)

				// Check if it actually has TV show characteristics
				if (parsedInfo && isParsedShow(parsedInfo)) {
					const hasSeasons = parsedInfo.seasons && parsedInfo.seasons.length > 0
					const hasEpisodes = parsedInfo.episodeNumbers && parsedInfo.episodeNumbers.length > 0
					if (hasSeasons || hasEpisodes || parsedInfo.isTv) {
						isTvShow = true
					}
				}

				if (!isTvShow) {
					// If no TV characteristics found, try parsing as movie
					parsedInfo = this.filenameParse(actualFilename, false)
					logger.info(`Parsed as movie: ${JSON.stringify(parsedInfo)}`)
				}
			} catch (error) {
				logger.warn(`Error parsing filename "${actualFilename}": ${error}`)
			}
		} else if (actualFilename && !this.filenameParse) {
			logger.warn("Filename parser not yet initialized, falling back to basic analysis")
		}

		// Combine heuristics with parsed data
		if (!isTvShow && likelyTvShow) {
			// Duration suggests TV show but filename parser didn't detect it
			// This could be a TV show with non-standard naming
			logger.info("Duration heuristic suggests TV show despite filename parsing")
		}

		if (isTvShow && !likelyTvShow && durationMinutes > 120) {
			// Filename suggests TV show but duration is very long (might be a movie)
			logger.info("Long duration suggests movie despite TV show filename pattern")
			isTvShow = false
		}

		// Extract information for display
		let displayTitle = title
		let season: number | undefined
		let episode: number | undefined
		let year: string | undefined

		if (parsedInfo) {
			if (parsedInfo.title && parsedInfo.title !== displayTitle) {
				displayTitle = parsedInfo.title
			}

			if (isParsedShow(parsedInfo)) {
				if (parsedInfo.seasons && parsedInfo.seasons.length > 0) {
					season = parsedInfo.seasons[0]
				}

				if (parsedInfo.episodeNumbers && parsedInfo.episodeNumbers.length > 0) {
					episode = parsedInfo.episodeNumbers[0]
				}
			}

			if (parsedInfo.year) {
				year = parsedInfo.year.toString()
			}
		}

		const analysis: VideoAnalysis = {
			isVideo: true,
			isTvShow,
			isMovie: !isTvShow,
			title: displayTitle,
			season,
			episode,
			year,
			duration: durationMinutes,
			originalFilename: actualFilename,
		}

		logger.info(`Video analysis result: ${JSON.stringify(analysis)}`)
		return analysis
	}

	/**
	 * Format video title for Discord display based on analysis
	 */
	public formatVideoTitle(analysis: VideoAnalysis): { details: string; state: string } {
		if (!analysis.isVideo) {
			return {
				details: analysis.title,
				state: "Watching",
			}
		}

		if (analysis.isTvShow && analysis.season && analysis.episode) {
			// TV Show with season and episode
			return {
				details: `${analysis.title} S${analysis.season.toString().padStart(2, "0")}E${analysis.episode.toString().padStart(2, "0")}`,
				state: "Watching",
			}
		}

		if (analysis.isTvShow && analysis.episode) {
			// TV Show with episode only
			return {
				details: `${analysis.title} - Episode ${analysis.episode}`,
				state: "Watching",
			}
		}

		if (analysis.isMovie && analysis.year) {
			// Movie with year
			return {
				details: `${analysis.title} (${analysis.year})`,
				state: "Watching",
			}
		}

		// Default: just the title
		return {
			details: analysis.title,
			state: "Watching",
		}
	}

	/**
	 * Get appropriate large text for Discord based on analysis
	 */
	public getLargeText(analysis: VideoAnalysis): string {
		if (!analysis.isVideo) {
			return "Watching Video"
		}

		if (analysis.isTvShow) {
			return "Watching TV Show"
		}

		if (analysis.isMovie) {
			return "Watching Movie"
		}

		return "Watching Video"
	}
}

export const videoAnalyzerService = VideoAnalyzerService.getInstance()
