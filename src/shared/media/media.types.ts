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
	/** Audio only: the credit a correction supplied for a file that carries none. */
	artist?: string
}

/**
 * Detected media info with content type and metadata
 */
export interface DetectedMediaInfo {
	content_type?: ContentType
	content_metadata?: ContentMetadata
	/**
	 * What to draw: a data URL once the cover has been proxied, since the
	 * renderer cannot fetch a remote image itself.
	 */
	content_image_url?: string
	/**
	 * Where that image came from. Kept beside the proxied one because a data URL
	 * is not an address: it cannot prefill a correction form or be stored.
	 */
	content_image_source_url?: string
	/**
	 * Where a manual correction for what is playing is filed, which is what
	 * `overrides:save` and `overrides:delete` are called with. Absent when the
	 * store would refuse the key this file produces, so its absence means the
	 * correction cannot be offered at all, not that nothing is playing.
	 */
	override_key?: string
	/** Whether a correction is already saved under that key. */
	override_active?: boolean
	/**
	 * What that key is bound to, which the screen has to be able to say because
	 * the two stop applying for different reasons. `metadata` is what the app
	 * read out of the file, so it covers every file that reads the same and is
	 * lost when a release is named differently. `file` is one file on disk, used
	 * for audio whose tags name nothing, and is lost when it moves or is renamed.
	 */
	override_binding?: "metadata" | "file"
}

/**
 * Media playback status
 */
export type MediaStatus = "stopped" | "playing" | "paused"
