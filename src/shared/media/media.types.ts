/**
 * Content type detected from media files
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
 * Detected media info with content type and metadata
 */
export interface DetectedMediaInfo {
	content_type?: ContentType
	content_metadata?: ContentMetadata
	content_image_url?: string
}

/**
 * Media playback status
 */
export type MediaStatus = "stopped" | "playing" | "paused"
