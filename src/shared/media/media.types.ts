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
	/**
	 * Where a manual correction for what is playing is filed, which is what
	 * `overrides:save` and `overrides:delete` are called with. Absent when the
	 * store would refuse the key this file produces, so its absence means the
	 * correction cannot be offered at all, not that nothing is playing.
	 */
	override_key?: string
	/** Whether a correction is already saved under that key. */
	override_active?: boolean
}

/**
 * Media playback status
 */
export type MediaStatus = "stopped" | "playing" | "paused"
