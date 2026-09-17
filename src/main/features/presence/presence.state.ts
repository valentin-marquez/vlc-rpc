import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type {
	Resolver as CatalogResolver,
	CatalogResult,
	ParsedVideo,
} from "@main/features/catalog"
import { parse as parseVideo } from "@main/features/catalog"
import type { CorrectedTags } from "@main/features/overrides"
import type { AppConfig } from "@shared/config/app-config"
import type { ResolvedLayout, VideoFacts } from "@shared/presence/layout"
import { renderLine, resolveLayout, videoVariables } from "@shared/presence/layout"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import { ActivityType } from "discord-api-types/v10"
import type { TimelineWindow } from "./presence.timeline"

// A parse that found no title yields "", which `??` would happily pick over the
// raw VLC title, so empty counts as absent here.
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
	return values.find((value) => value !== undefined && value !== "")
}

interface PresenceLines {
	details: string
	state: string
	/** Empty when the layout has nothing to name the activity after. */
	activityName: string
}

function videoFacts(
	rawTitle: string,
	catalogResult: CatalogResult | null,
	localParse: ParsedVideo | null,
): VideoFacts {
	const isTvShow = catalogResult
		? catalogResult.mediaKind === "tv"
		: localParse?.season !== undefined || localParse?.episode !== undefined

	return {
		title: firstNonEmpty(catalogResult?.title, localParse?.title, rawTitle) ?? "",
		// A film whose filename happens to parse a season must not grow an episode.
		season: isTvShow ? (catalogResult?.season ?? localParse?.season) : undefined,
		episode: isTvShow ? (catalogResult?.episode ?? localParse?.episode) : undefined,
		year: localParse?.year,
	}
}

/**
 * What the user typed a file is, for audio whose own tags say nothing. Asked of
 * the music feature, which owns how a correction is keyed, because every music
 * template below reads tags and a file with none has nothing else to read.
 */
export interface AudioCorrections {
	correctedTagsFor(status: VlcStatus): Promise<CorrectedTags | null>
}

// Both states build the same lines from the same layout, so a preset reads the same
// whether playback is running or paused.
function buildLines(
	layout: ResolvedLayout,
	mediaInfo: VlcStatus,
	catalogResult: CatalogResult | null,
	localParse: ParsedVideo | null,
	corrected: CorrectedTags | null,
): PresenceLines {
	const media = mediaInfo.media

	if (mediaInfo.mediaType === "video") {
		const variables = videoVariables(videoFacts(media.title ?? "", catalogResult, localParse))
		return {
			details: renderLine(layout.video.details, variables),
			state: renderLine(layout.video.state, variables),
			activityName: "",
		}
	}

	// Field by field: a correction that names only the artist leaves the title
	// the file reported, which for this case is usually its own name and is
	// still the best thing there is to show.
	const variables = {
		title: firstNonEmpty(corrected?.title, media.title) ?? "",
		artist: firstNonEmpty(corrected?.artist, media.artist) ?? "",
		album: media.album ?? "",
	}

	return {
		details: renderLine(layout.music.details, variables),
		state: renderLine(layout.music.state, variables),
		activityName: renderLine(layout.music.activityName, variables),
	}
}

// The two preset names are the whole of what is stored, so the lines are composed on
// every read and cannot fall behind the choice they came from.
function layoutFrom(config: AppConfig): ResolvedLayout {
	return resolveLayout({ music: config.layoutPreset, video: config.videoLayoutPreset })
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
		private readonly corrections: AudioCorrections,
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

		// The artwork first, and the text after it. Both can come from the same
		// acoustic match, and the lookup that learns it happens inside this call:
		// asked in the other order the text would answer from the poll before,
		// leaving the right cover beside the file name for one turn of the loop.
		const cover = mediaType === "audio" ? await this.artwork.resolve(mediaInfo) : null
		const corrected =
			mediaType === "audio" ? await this.corrections.correctedTagsFor(mediaInfo) : null

		const lines = buildLines(layoutFrom(config), mediaInfo, catalogResult, localParse, corrected)

		const details = this.formatText(lines.details)
		const state = this.formatText(lines.state)

		const { start: startTimestamp, end: endTimestamp } = window

		// Discord shows this on hover over the small image, so it is a word, not the
		// asset key that picks the image itself.
		let smallText = "Playing"
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
			smallText += `, ${resolution}`
		}

		if (cover) {
			largeImage = cover
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

		if (lines.activityName !== "") {
			presenceData.name = lines.activityName
		}

		const verb = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence: ${verb} ${details} - ${state}`)

		return presenceData
	}
}

class PausedState extends MediaState {
	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly corrections: AudioCorrections,
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

		// The artwork first, and the text after it. Both can come from the same
		// acoustic match, and the lookup that learns it happens inside this call:
		// asked in the other order the text would answer from the poll before,
		// leaving the right cover beside the file name for one turn of the loop.
		const cover = mediaType === "audio" ? await this.artwork.resolve(mediaInfo) : null
		const corrected =
			mediaType === "audio" ? await this.corrections.correctedTagsFor(mediaInfo) : null

		const lines = buildLines(layoutFrom(config), mediaInfo, catalogResult, localParse, corrected)

		const details = this.formatText(lines.details)
		const state = this.formatText(lines.state)

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
			smallText += `, ${resolution}`
		}

		if (cover) {
			largeImage = cover
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

		if (lines.activityName !== "") {
			presenceData.name = lines.activityName
		}

		const verb = activityType === ActivityType.Watching ? "Watching" : "Listening to"
		logger.info(`Updated presence (paused): ${verb} ${details} - ${state}`)

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

	constructor(artwork: ArtworkResolver, catalog: CatalogResolver, corrections: AudioCorrections) {
		this.states = {
			stopped: new StoppedState(),
			noStatus: new NoStatusState(),
			playing: new PlayingState(artwork, catalog, corrections),
			paused: new PausedState(artwork, catalog, corrections),
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
