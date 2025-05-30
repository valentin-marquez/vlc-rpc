import type { AppConfig } from "@shared/types"
import {
	type DiscordPresenceData,
	type EnhancedMediaInfo,
	MediaActivityType,
} from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import { configService } from "./config"
import { coverArtService } from "./cover-art"
import { logger } from "./logger"
import { videoDetectorService } from "./video-detector"

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

		const enhancedInfo =
			mediaInfo.mediaType === "video"
				? await videoDetectorService.analyze(mediaInfo)
				: (mediaInfo as VlcStatus & EnhancedMediaInfo)

		const media = enhancedInfo.media
		const mediaType = enhancedInfo.mediaType || "unknown"
		const contentType = enhancedInfo.content_type || ""
		const contentMetadata = enhancedInfo.content_metadata || {}

		// Improved activity type detection
		let activityType = MediaActivityType.LISTENING

		// Use WATCHING for video content or specific content types
		if (
			mediaType === "video" ||
			contentType === "tv_show" ||
			contentType === "movie" ||
			contentType === "anime" ||
			contentType === "video"
		) {
			activityType = MediaActivityType.WATCHING
		}

		// Override for music even if it has video streams (music videos, visualizations)
		if (media.artist && media.album && !contentType) {
			activityType = MediaActivityType.LISTENING
			logger.info("Detected music with artist/album info, using LISTENING activity")
		}

		let details = ""
		let state = ""

		if (contentType === "tv_show" && contentMetadata.show_name) {
			const showName = contentMetadata.show_name
			const season = contentMetadata.season || 0
			const episode = contentMetadata.episode || 0

			if (season > 0 && episode > 0) {
				details = `${showName} S${season.toString().padStart(2, "0")}E${episode.toString().padStart(2, "0")}`
			} else {
				details = showName
			}

			state = "Now watching"
		} else if (contentType === "movie" && contentMetadata.movie_name) {
			const movieName = contentMetadata.movie_name
			const year = contentMetadata.year || ""

			if (year) {
				details = `${movieName} (${year})`
			} else {
				details = movieName
			}

			state = "Now watching"
		} else if (contentType === "anime" && contentMetadata.anime_name) {
			const animeName = contentMetadata.anime_name
			const episode = contentMetadata.episode || 0

			if (episode > 0) {
				details = `${animeName} - Episode ${episode}`
			} else {
				details = animeName
			}

			state = "Now watching anime"
		} else {
			details = media.title || "Unknown"

			if (activityType === MediaActivityType.LISTENING) {
				state = `by ${media.artist || "Unknown Artist"}`
			} else {
				state = "Now watching"
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

		const contentImageUrl = enhancedInfo.content_image_url
		if (contentImageUrl) {
			largeImage = contentImageUrl
		}

		if (contentType === "tv_show") {
			largeText = "Watching TV Show"
		} else if (contentType === "movie") {
			largeText = "Watching a Movie"
		} else if (contentType === "anime") {
			largeText = "Watching Anime"
		} else if (activityType === MediaActivityType.LISTENING) {
			largeText = "Listening to Music"
		}

		const videoInfo = enhancedInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (!contentImageUrl && mediaType === "audio" && media) {
			const coverArtUrl = await coverArtService.fetch(mediaInfo)
			if (coverArtUrl) {
				largeImage = coverArtUrl
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

		const activityName = activityType === MediaActivityType.WATCHING ? "Watching" : "Listening to"
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

		const enhancedInfo =
			mediaInfo.mediaType === "video"
				? await videoDetectorService.analyze(mediaInfo)
				: (mediaInfo as VlcStatus & EnhancedMediaInfo)

		const media = enhancedInfo.media
		const mediaType = enhancedInfo.mediaType || "unknown"
		const contentType = enhancedInfo.content_type || ""
		const contentMetadata = enhancedInfo.content_metadata || {}

		// Improved activity type detection (same as PlayingState)
		let activityType = MediaActivityType.LISTENING

		// Use WATCHING for video content or specific content types
		if (
			mediaType === "video" ||
			contentType === "tv_show" ||
			contentType === "movie" ||
			contentType === "anime" ||
			contentType === "video"
		) {
			activityType = MediaActivityType.WATCHING
		}

		// Override for music even if it has video streams (music videos, visualizations)
		if (media.artist && media.album && !contentType) {
			activityType = MediaActivityType.LISTENING
			logger.info("Detected music with artist/album info, using LISTENING activity (paused)")
		}

		let details = ""
		let state = ""

		if (contentType === "tv_show" && contentMetadata.show_name) {
			const showName = contentMetadata.show_name
			const season = contentMetadata.season || 0
			const episode = contentMetadata.episode || 0

			if (season > 0 && episode > 0) {
				details = `${showName} S${season.toString().padStart(2, "0")}E${episode.toString().padStart(2, "0")}`
			} else {
				details = showName
			}

			state = "Paused"
		} else if (contentType === "movie" && contentMetadata.movie_name) {
			const movieName = contentMetadata.movie_name
			const year = contentMetadata.year || ""

			if (year) {
				details = `${movieName} (${year})`
			} else {
				details = movieName
			}

			state = "Paused"
		} else if (contentType === "anime" && contentMetadata.anime_name) {
			const animeName = contentMetadata.anime_name
			const episode = contentMetadata.episode || 0

			if (episode > 0) {
				details = `${animeName} - Episode ${episode}`
			} else {
				details = animeName
			}

			state = "Paused"
		} else {
			details = media.title || "Unknown"

			if (activityType === MediaActivityType.LISTENING) {
				state = `by ${media.artist || "Unknown Artist"}`
			} else {
				state = "Paused"
			}
		}

		details = this.formatText(details)
		state = this.formatText(state)

		let smallText = "Paused"
		let largeImage = config.largeImage
		let largeText = "VLC Media Player (Paused)"

		const contentImageUrl = enhancedInfo.content_image_url
		if (contentImageUrl) {
			largeImage = contentImageUrl
		}

		if (contentType === "tv_show") {
			largeText = "Watching TV Show (Paused)"
		} else if (contentType === "movie") {
			largeText = "Watching a Movie (Paused)"
		} else if (contentType === "anime") {
			largeText = "Watching Anime (Paused)"
		} else if (activityType === MediaActivityType.LISTENING) {
			largeText = "Listening to Music (Paused)"
		}

		const videoInfo = enhancedInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (!contentImageUrl && mediaType === "audio" && media) {
			const coverArtUrl = await coverArtService.fetch(mediaInfo)
			if (coverArtUrl) {
				largeImage = coverArtUrl
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

		const activityName = activityType === MediaActivityType.WATCHING ? "Watching" : "Listening to"
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
