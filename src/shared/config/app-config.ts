import type { StoredMusicLayout, StoredVideoLayout } from "@shared/presence/layout"

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
 * Application configuration
 */
export interface AppConfig {
	largeImage: string
	pausedImage: string
	playingImage: string
	presenceUpdateInterval: number // milliseconds between polls of VLC's HTTP status endpoint
	statusTimeout: number // milliseconds before a request to VLC is aborted
	vlc: VlcConfig
	isFirstRun: boolean
	minimizeToTray: boolean
	startWithSystem: boolean
	version: string
	// File metadata storage
	fileMetadata: Record<string, FileMetadata> // key = file path, value = metadata
	// RPC enable/disable state, including a temporary disable window
	rpcEnabled: boolean
	rpcDisabledUntil?: number
	/**
	 * How the profile is laid out, one choice per media kind. Either the arrangement this
	 * release ships, by name, so a later one can improve it, or the pieces the user placed.
	 */
	layoutPreset?: StoredMusicLayout
	videoLayoutPreset?: StoredVideoLayout
}
