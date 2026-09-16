import type { AppConfig } from "@shared/config/app-config"
import {
	type PresenceLayout,
	applyTemplate,
	getDefaultLayout,
	getLayoutByPreset,
} from "@shared/presence/layout"

import type { MediaState } from "./media.store"

/**
 * The four lines Discord draws for the current file. Empty strings rather than
 * absent fields, so the card can drop a line without the caller branching.
 */
export interface PresenceLines {
	header: string
	details: string
	state: string
	largeText: string
}

/** Same resolution order the main process uses when it builds the presence. */
export function layoutFromConfig(config: AppConfig | null): PresenceLayout {
	if (config?.presenceLayout) {
		return config.presenceLayout
	}
	if (config?.layoutPreset) {
		return getLayoutByPreset(config.layoutPreset)
	}
	return getDefaultLayout()
}

export function presenceLines(media: MediaState, layout: PresenceLayout): PresenceLines {
	if (media.mediaType === "audio") {
		const variables = {
			title: media.title ?? "Unknown Song",
			artist: media.artist ?? "Unknown Artist",
			album: media.album ?? "",
		}

		return {
			// The activity name is the only part of the header the app sets, and it
			// only sets it for audio. Video therefore carries the bare verb.
			header: `Listening to ${applyTemplate(layout.activityName ?? "{artist}", variables)}`,
			details: applyTemplate(layout.musicDetails, variables),
			state: applyTemplate(layout.musicState, variables),
			largeText: media.album ?? "Listening to Music",
		}
	}

	const isShow = media.contentType === "tv_show" || media.season !== null || media.episode !== null
	const variables = {
		title: media.title ?? "Unknown",
		episodeInfo: episodeInfo(media) || (isShow ? "TV Show" : "Movie"),
		year: media.year ?? "",
		season: media.season?.toString() ?? "",
		episode: media.episode?.toString() ?? "",
	}

	return {
		header: "Watching",
		details: applyTemplate(layout.videoDetails, variables),
		state: applyTemplate(layout.videoState, variables),
		largeText: "Watching Video",
	}
}

function episodeInfo(media: MediaState): string {
	if (media.season !== null && media.episode !== null) {
		return `S${media.season}E${media.episode}`
	}
	if (media.season !== null) {
		return `Season ${media.season}`
	}
	if (media.episode !== null) {
		return `Episode ${media.episode}`
	}
	return ""
}
