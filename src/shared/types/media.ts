import type { ActivityType } from "discord-api-types/v10"

/**
 * Content type detected from media files
 * Enhanced with better detection categories
 */
export type ContentType =
	| "tv_show"
	| "movie"
	| "anime"
	| "video"
	| "audio"
	| "music_video"
	| "documentary"
	| "unknown"

/**
 * Content metadata for detected media
 */
export interface ContentMetadata {
	original_title?: string
	clean_title?: string
	show_name?: string
	season?: number
	episode?: number
	movie_name?: string
	year?: string
	anime_name?: string
	title?: string
}

/**
 * Enhanced media info with detected content type and metadata
 */
export interface EnhancedMediaInfo {
	content_type?: ContentType
	content_metadata?: ContentMetadata
	content_image_url?: string
}

/**
 * Media playback status
 */
export type MediaStatus = "stopped" | "playing" | "paused"

/**
 * Current media information
 */
export interface MediaInfo {
	title: string | null
	artist: string | null
	album: string | null
	duration: number | null
	position: number | null
	artwork: string | null
}

/**
 * Discord presence update data
 */
export interface DiscordPresenceData {
	details?: string
	state?: string
	start_timestamp?: number
	end_timestamp?: number
	large_image?: string
	large_text?: string
	small_image?: string
	small_text?: string
	party_id?: string
	party_size?: [number, number]
	join?: string
	spectate?: string
	match?: string
	buttons?: Array<{ label: string; url: string }>
	instance?: boolean
	activity_type?: ActivityType
	name?: string
}
