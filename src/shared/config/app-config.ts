import type { MusicPreset, VideoPreset } from "@shared/presence/layout"

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
	 * How the profile is laid out, one choice per media kind. The music one keeps the
	 * key it was given before video had a choice of its own. The lines they stand for
	 * are composed on read rather than stored, so the two can never disagree.
	 */
	layoutPreset?: MusicPreset
	videoLayoutPreset?: VideoPreset
}
