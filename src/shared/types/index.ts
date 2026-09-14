/**
 * VLC Configuration schema
 */
export interface VlcConfig {
	httpPort: number
	httpPassword: string
	httpEnabled: boolean
}

/**
 * File metadata stored for media files
 */
export interface FileMetadata {
	"X-COVER-URL": string
	"X-APP-VERSION": string
	"X-PROCESSED-BY": string
	"X-EXPIRY-DATE": string
}

/**
 * Discord Rich Presence Layout configuration
 * Allows customization of how media information is displayed
 */
export interface PresenceLayout {
	// Activity name (what appears after "Listening to" or "Watching")
	activityName?: string // Template for activity name (e.g., "{artist}", "{title}", "VLC")
	// Music layouts
	musicDetails: string // Template for details line (e.g., "{title}", "{artist}")
	musicState: string // Template for state line (e.g., "by {artist}", "{album}")
	// Video layouts
	videoDetails: string // Template for details line (e.g., "{title}")
	videoState: string // Template for state line (e.g., "S{season}E{episode}", "{year}")
}

/**
 * Predefined layout presets
 */
export type LayoutPreset = "default" | "album-focused" | "artist-spotlight"

/**
 * Application configuration
 */
export interface AppConfig {
	largeImage: string
	pausedImage: string
	playingImage: string
	presenceUpdateInterval: number
	fastCheckInterval: number
	statusTimeout: number
	vlc: VlcConfig
	isFirstRun: boolean
	minimizeToTray: boolean
	startWithSystem: boolean
	version: string
	// File metadata storage
	fileMetadata: Record<string, FileMetadata> // key = file path, value = metadata
	// Discord Rich Presence layout configuration
	presenceLayout?: PresenceLayout
	layoutPreset?: LayoutPreset
}

/**
 * Generic connection status
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

/**
 * Application status
 */
export type AppStatus = "idle" | "loading" | "ready" | "error"
