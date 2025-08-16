import type { AppConfig } from "@shared/types"
import type { DiscordPresenceData, EnhancedMediaInfo } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import { ActivityType } from "discord-api-types/v10"
import { configService } from "./config"
import { coverArtService } from "./cover-art"
import { logger } from "./logger"
import { VideoAnalyzerService } from "./video-analyzer"

/**
 * Base class for media states
 */
abstract class MediaState {
	protected formatText(text: string, maxLength = 128): string {
		if (!text) return ""
		if (text.length > maxLength) {
			return `${text.substring(0, maxLength - 3)}...`
		}
		return text
	}

	public abstract updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null>
}

class StoppedState extends MediaState {
	public async updatePresence(_mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (VLC stopped)")
		return null
	}
}

class NoStatusState extends MediaState {
	public async updatePresence(_mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (no status data)")
		return null
	}
}

class PlayingState extends MediaState {
	public async updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get<AppConfig>()
		const currentTime = Math.floor(Date.now() / 1000)

		// Use the media info directly since VLC status service already provides reliable type detection
		const enhancedInfo = mediaInfo as VlcStatus & EnhancedMediaInfo

		const media = enhancedInfo.media
		const mediaType = enhancedInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		let details = ""
		let state = ""

		if (activityType === ActivityType.Listening) {
			// For music, put artist in details and song in state for better visibility
			details = media.title || "Unknown Song"
			state = `by ${media.artist || "Unknown Artist"}`
		} else {
			// For video content, analyze the video and provide richer information
			const videoAnalyzer = VideoAnalyzerService.getInstance()
			const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)

			if (videoAnalysis.isTvShow) {
				// TV Show: Show name as details, episode info as state
				details = videoAnalysis.title

				let episodeInfo = ""
				if (videoAnalysis.season && videoAnalysis.episode) {
					episodeInfo = `S${videoAnalysis.season}E${videoAnalysis.episode}`
				} else if (videoAnalysis.season) {
					episodeInfo = `Season ${videoAnalysis.season}`
				} else if (videoAnalysis.episode) {
					episodeInfo = `Episode ${videoAnalysis.episode}`
				}

				state = episodeInfo || "TV Show"
			} else {
				// Movie: Movie title as details, year as state
				details = videoAnalysis.title
				state = videoAnalysis.year ? `(${videoAnalysis.year})` : "Movie"
			}
		}

		details = this.formatText(details)
		state = this.formatText(state)

		let startTimestamp: number | undefined
		let endTimestamp: number | undefined

		const playback = mediaInfo.playback

		if (playback) {
			const duration = playback.duration
			const position = playback.time

			if (position >= 0 && duration > 0 && duration < 86400) {
				startTimestamp = currentTime - position
				endTimestamp = currentTime + (duration - position)
			} else {
				startTimestamp = currentTime
			}
		}

		let smallText = config.playingImage
		let largeImage = config.largeImage
		let largeText = "VLC Media Player"

		// Use artwork from VLC if available
		if (media.artworkUrl) {
			largeImage = media.artworkUrl
		}

		// Set appropriate large text based on media type
		if (activityType === ActivityType.Listening) {
			// Use album name if available, otherwise fallback to "Listening to Music"
			largeText = media.album || "Listening to Music"
		} else {
			largeText = "Watching Video"
		}

		const videoInfo = enhancedInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (mediaType === "audio" && media) {
			const coverArtUrl = await coverArtService.fetch(mediaInfo)
			if (coverArtUrl) {
				largeImage = coverArtUrl
			}
		}

		// For video content, try to fetch cover art from Google
		if (mediaType === "video" && media) {
			const videoCoverUrl = await coverArtService.fetchVideoImageFromGoogle(mediaInfo)
			if (videoCoverUrl) {
				largeImage = videoCoverUrl
				logger.info(`Using video cover from Google: ${videoCoverUrl}`)
			}
		}

		const presenceData: DiscordPresenceData = {
			details,
			state,
			large_image: largeImage,
			large_text: largeText,
			small_image: config.playingImage,
			small_text: smallText,
			start_timestamp: startTimestamp,
			end_timestamp: endTimestamp,
			activity_type: activityType,
		}

		// Set custom app name for music
		if (activityType === ActivityType.Listening && media && media.artist) {
			presenceData.name = media.artist
		}

		const activityName = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence: ${activityName} ${details} - ${state}`)

		return presenceData
	}
}

class PausedState extends MediaState {
	public async updatePresence(mediaInfo: VlcStatus | null): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get<AppConfig>()

		// Use the media info directly since VLC status service already provides reliable type detection
		const enhancedInfo = mediaInfo as VlcStatus & EnhancedMediaInfo

		const media = enhancedInfo.media
		const mediaType = enhancedInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Paused activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		let details = ""
		let state = ""

		if (activityType === ActivityType.Listening) {
			details = media.title || "Unknown Song"
			state = `by ${media.artist || "Unknown Artist"}`
		} else {
			// For video content, analyze the video and provide richer information
			const videoAnalyzer = VideoAnalyzerService.getInstance()
			const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)

			if (videoAnalysis.isTvShow) {
				// TV Show: Show name as details, episode info as state
				details = videoAnalysis.title

				let episodeInfo = ""
				if (videoAnalysis.season && videoAnalysis.episode) {
					episodeInfo = `S${videoAnalysis.season}E${videoAnalysis.episode}`
				} else if (videoAnalysis.season) {
					episodeInfo = `Season ${videoAnalysis.season}`
				} else if (videoAnalysis.episode) {
					episodeInfo = `Episode ${videoAnalysis.episode}`
				}

				state = episodeInfo || "TV Show"
			} else {
				// Movie: Movie title as details, year as state
				details = videoAnalysis.title
				state = videoAnalysis.year ? `(${videoAnalysis.year})` : "Movie"
			}
		}

		details = this.formatText(details)
		state = this.formatText(state)

		let smallText = "Paused"
		let largeImage = config.largeImage
		let largeText = "VLC Media Player"

		// Use artwork from VLC if available
		if (media.artworkUrl) {
			largeImage = media.artworkUrl
		}

		// Set appropriate large text based on media type
		if (activityType === ActivityType.Listening) {
			// Use album name if available, otherwise fallback to "Listening to Music"
			largeText = media.album || "Listening to Music"
		} else {
			largeText = "Watching Video"
		}

		const videoInfo = enhancedInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (mediaType === "audio" && media) {
			const coverArtUrl = await coverArtService.fetch(mediaInfo)
			if (coverArtUrl) {
				largeImage = coverArtUrl
			}
		}

		// For video content, try to fetch cover art from Google
		if (mediaType === "video" && media) {
			const videoCoverUrl = await coverArtService.fetchVideoImageFromGoogle(mediaInfo)
			if (videoCoverUrl) {
				largeImage = videoCoverUrl
				logger.info(`Using video cover from Google: ${videoCoverUrl}`)
			}
		}

		const presenceData: DiscordPresenceData = {
			details,
			state,
			large_image: largeImage,
			large_text: largeText,
			small_image: config.pausedImage,
			small_text: smallText,
			activity_type: activityType,
		}

		const activityName = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence (paused): ${activityName} ${details} - ${state}`)

		return presenceData
	}
}

/**
 * Service to manage media state and update Discord presence
 */
export class MediaStateService {
	private static instance: MediaStateService | null = null
	private states: Record<string, MediaState>

	private constructor() {
		this.states = {
			stopped: new StoppedState(),
			noStatus: new NoStatusState(),
			playing: new PlayingState(),
			paused: new PausedState(),
		}

		logger.info("Media state service initialized")
	}

	public static getInstance(): MediaStateService {
		if (!MediaStateService.instance) {
			MediaStateService.instance = new MediaStateService()
		}
		return MediaStateService.instance
	}

	public async getDiscordPresence(
		vlcStatus: VlcStatus | null,
	): Promise<DiscordPresenceData | null> {
		if (!vlcStatus) {
			return this.states.noStatus.updatePresence(null)
		}

		if (!vlcStatus.active) {
			return this.states.stopped.updatePresence(vlcStatus)
		}

		switch (vlcStatus.status) {
			case "playing":
				return this.states.playing.updatePresence(vlcStatus)
			case "paused":
				return this.states.paused.updatePresence(vlcStatus)
			default:
				return this.states.stopped.updatePresence(vlcStatus)
		}
	}
}

export const mediaStateService = MediaStateService.getInstance()
