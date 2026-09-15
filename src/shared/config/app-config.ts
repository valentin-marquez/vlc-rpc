import type { LayoutPreset, PresenceLayout } from "@shared/presence/layout"

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
	// RPC enable/disable state, including a temporary disable window
	rpcEnabled: boolean
	rpcDisabledUntil?: number
	// Discord Rich Presence layout configuration
	presenceLayout?: PresenceLayout
	layoutPreset?: LayoutPreset
}
