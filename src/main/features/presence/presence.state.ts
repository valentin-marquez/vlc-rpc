import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type { Resolver as CatalogResolver } from "@main/features/catalog"
import { parse as parseVideo } from "@main/features/catalog"
import { applyTemplate, getDefaultLayout, getLayoutByPreset } from "@shared/presence/layout"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import { ActivityType } from "discord-api-types/v10"
import type { TimelineWindow } from "./presence.timeline"

// A parse that found no title yields "", which `??` would happily pick over the
// raw VLC title, so empty counts as absent here.
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
	return values.find((value) => value !== undefined && value !== "")
}

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

	public abstract updatePresence(
		mediaInfo: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null>
}

class StoppedState extends MediaState {
	public async updatePresence(
		_mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (VLC stopped)")
		return null
	}
}

class NoStatusState extends MediaState {
	public async updatePresence(
		_mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		logger.info("Cleared presence (no status data)")
		return null
	}
}

class PlayingState extends MediaState {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
	) {
		super()
	}

	public async updatePresence(
		mediaInfo: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get()

		const media = mediaInfo.media
		const mediaType = mediaInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const catalogResult = mediaType === "video" ? await this.catalog.resolve(mediaInfo) : null
		// Parsed even on a catalog hit: the providers never report the year of the
		// concrete file being played, and parsing is pure and local.
		const localParse = mediaType === "video" ? parseVideo(media.title || "") : null

		// Get the layout configuration
		const layout =
			config.presenceLayout ||
			(config.layoutPreset ? getLayoutByPreset(config.layoutPreset) : getDefaultLayout())

		let details = ""
		let state = ""

		if (activityType === ActivityType.Listening) {
			// For music, use customizable layout
			const variables = {
				title: media.title || "Unknown Song",
				artist: media.artist || "Unknown Artist",
				album: media.album || "",
			}

			details = applyTemplate(layout.musicDetails, variables)
			state = applyTemplate(layout.musicState, variables)
		} else {
			const isTvShow = catalogResult
				? catalogResult.mediaKind === "tv"
				: localParse?.season !== undefined || localParse?.episode !== undefined

			let episodeInfo = ""
			const season = catalogResult?.season ?? localParse?.season
			const episode = catalogResult?.episode ?? localParse?.episode
			if (isTvShow) {
				if (season !== undefined && episode !== undefined) {
					episodeInfo = `S${season}E${episode}`
				} else if (season !== undefined) {
					episodeInfo = `Season ${season}`
				} else if (episode !== undefined) {
					episodeInfo = `Episode ${episode}`
				}
			}

			const title = firstNonEmpty(catalogResult?.title, localParse?.title, media.title) ?? "Unknown"
			const year = localParse?.year

			const variables = {
				title,
				episodeInfo: episodeInfo || (isTvShow ? "TV Show" : "Movie"),
				year: year?.toString() ?? "",
				season: season?.toString() ?? "",
				episode: episode?.toString() ?? "",
			}

			details = applyTemplate(layout.videoDetails, variables)
			state = applyTemplate(layout.videoState, variables)
		}

		details = this.formatText(details)
		state = this.formatText(state)

		const { start: startTimestamp, end: endTimestamp } = window

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

		if (mediaType === "video" && catalogResult?.poster) {
			largeImage = catalogResult.poster
		}

		const videoInfo = mediaInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (mediaType === "audio" && media) {
			const cover = await this.artwork.resolve(mediaInfo)
			if (cover) {
				largeImage = cover
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

		// Set custom activity name based on layout configuration
		if (activityType === ActivityType.Listening && layout.activityName) {
			const activityNameVariables = {
				title: media.title || "Unknown Song",
				artist: media.artist || "Unknown Artist",
				album: media.album || "",
			}
			presenceData.name = applyTemplate(layout.activityName, activityNameVariables)
		}

		const activityName = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence: ${activityName} ${details} - ${state}`)

		return presenceData
	}
}

class PausedState extends MediaState {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
	) {
		super()
	}

	public async updatePresence(
		mediaInfo: VlcStatus | null,
		_window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!mediaInfo) {
			return null
		}

		const config = configService.get()

		const media = mediaInfo.media
		const mediaType = mediaInfo.mediaType || "unknown"

		// Simple activity type detection based on VLC's media type
		const activityType = mediaType === "video" ? ActivityType.Watching : ActivityType.Listening

		logger.info(
			`Paused activity type: ${activityType === ActivityType.Watching ? "WATCHING" : "LISTENING"} for media type: ${mediaType}`,
		)

		const catalogResult = mediaType === "video" ? await this.catalog.resolve(mediaInfo) : null
		// Parsed even on a catalog hit: the providers never report the year of the
		// concrete file being played, and parsing is pure and local.
		const localParse = mediaType === "video" ? parseVideo(media.title || "") : null

		let details = ""
		let state = ""

		if (activityType === ActivityType.Listening) {
			details = media.title || "Unknown Song"
			state = `by ${media.artist || "Unknown Artist"}`
		} else {
			const isTvShow = catalogResult
				? catalogResult.mediaKind === "tv"
				: localParse?.season !== undefined || localParse?.episode !== undefined

			const season = catalogResult?.season ?? localParse?.season
			const episode = catalogResult?.episode ?? localParse?.episode
			const title = firstNonEmpty(catalogResult?.title, localParse?.title, media.title) ?? "Unknown"

			if (isTvShow) {
				// TV Show: Show name as details, episode info as state
				details = title

				let episodeInfo = ""
				if (season !== undefined && episode !== undefined) {
					episodeInfo = `S${season}E${episode}`
				} else if (season !== undefined) {
					episodeInfo = `Season ${season}`
				} else if (episode !== undefined) {
					episodeInfo = `Episode ${episode}`
				}

				state = episodeInfo || "TV Show"
			} else {
				// Movie: Movie title as details, year as state
				details = title
				state = localParse?.year ? `(${localParse.year})` : "Movie"
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

		if (mediaType === "video" && catalogResult?.poster) {
			largeImage = catalogResult.poster
		}

		const videoInfo = mediaInfo.videoInfo
		if (mediaType === "video" && videoInfo && videoInfo.width && videoInfo.height) {
			const resolution = `${videoInfo.width}x${videoInfo.height}`
			smallText += ` • ${resolution}`
		}

		if (mediaType === "audio" && media) {
			const cover = await this.artwork.resolve(mediaInfo)
			if (cover) {
				largeImage = cover
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
interface MediaStates {
	stopped: MediaState
	noStatus: MediaState
	playing: MediaState
	paused: MediaState
}

export class Service {
	private states: MediaStates

	constructor(artwork: ArtworkResolver, catalog: CatalogResolver) {
		this.states = {
			stopped: new StoppedState(),
			noStatus: new NoStatusState(),
			playing: new PlayingState(artwork, catalog),
			paused: new PausedState(artwork, catalog),
		}

		logger.info("Media state service initialized")
	}

	public async getDiscordPresence(
		vlcStatus: VlcStatus | null,
		window: TimelineWindow,
	): Promise<DiscordPresenceData | null> {
		if (!vlcStatus) {
			return this.states.noStatus.updatePresence(null, window)
		}

		if (!vlcStatus.active) {
			return this.states.stopped.updatePresence(vlcStatus, window)
		}

		switch (vlcStatus.status) {
			case "playing":
				return this.states.playing.updatePresence(vlcStatus, window)
			case "paused":
				return this.states.paused.updatePresence(vlcStatus, window)
			default:
				return this.states.stopped.updatePresence(vlcStatus, window)
		}
	}
}
