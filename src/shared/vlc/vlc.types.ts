/**
 * Processed VLC status for our application
 */
export interface VlcStatus {
	active: boolean
	status: string
	timestamp: number
	plid: number | null
	playback: {
		position: number
		time: number
		duration: number
		rate: number
	}
	mediaType: "video" | "audio"
	media: {
		title?: string
		artist?: string
		album?: string
		artworkUrl?: string | undefined
	}
	videoInfo?:
		| {
				width: number
				height: number
		  }
		| undefined
}

/**
 * Why checkVlcStatus reached its isRunning verdict. Not configured (VLC's own
 * HTTP interface is off) is distinct from not running (VLC just isn't open):
 * the app can fix the first on its own, and only one of them is a problem.
 */
export const VLC_CONNECTION_REASONS = [
	"running",
	"not-configured",
	"not-running",
	"auth-failed",
	"misconfigured-endpoint",
	"unexpected-status",
	"timeout",
	"unknown-error",
] as const

export type VlcConnectionReason = (typeof VLC_CONNECTION_REASONS)[number]

/**
 * VLC connection check result. It carries no message: what a person reads is
 * built from the reason in describeVlcConnection, so a caught error can never
 * reach the screen as prose.
 */
export interface VlcConnectionStatus {
	isRunning: boolean
	reason: VlcConnectionReason
}
