/**
 * Raw VLC status response from the HTTP API
 */
export interface VlcRawStatus {
	state: string
	time?: number
	length?: number
	position?: number
	information?: {
		category?: Record<string, unknown>
	}
}

/**
 * Processed VLC status for our application
 */
export interface VlcStatus {
	active: boolean
	status: string
	timestamp: number
	playback: {
		position: number
		time: number
		duration: number
	}
	mediaType: "video" | "audio"
	media: {
		title?: string
		artist?: string
		album?: string
		artworkUrl?: string
	}
	videoInfo?: {
		width: number
		height: number
	}
}

/**
 * VLC connection check result
 */
export interface VlcConnectionStatus {
	isRunning: boolean
	message: string
}
