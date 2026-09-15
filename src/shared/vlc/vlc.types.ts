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
 * Why checkVlcStatus reached its isRunning verdict, for callers that need to
 * act on the cause rather than parse the human readable message. Not
 * configured (VLC's own HTTP interface is off) is distinct from not running
 * (VLC just isn't open): the app can fix the first on its own.
 */
export type VlcConnectionReason =
	| "running"
	| "not-configured"
	| "not-running"
	| "auth-failed"
	| "misconfigured-endpoint"
	| "unexpected-status"
	| "timeout"
	| "unknown-error"

/**
 * VLC connection check result
 */
export interface VlcConnectionStatus {
	isRunning: boolean
	reason: VlcConnectionReason
	message: string
}
