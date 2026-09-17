import type { StoredMusicLayout, StoredVideoLayout } from "@shared/presence/layout"

export interface VlcConfig {
	httpPort: number
	httpPassword: string
	httpEnabled: boolean
}

export interface FileMetadata {
	"X-COVER-URL": string
	"X-APP-VERSION": string
	"X-PROCESSED-BY": string
	"X-EXPIRY-DATE": string
}

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
	/** Keyed by file path. */
	fileMetadata: Record<string, FileMetadata>
	rpcEnabled: boolean
	/** While this stands in the future, the presence is off whatever `rpcEnabled` says. */
	rpcDisabledUntil?: number
	/**
	 * How the profile is laid out, one choice per media kind. Either the arrangement this
	 * release ships, by name, so a later one can improve it, or the pieces the user placed.
	 */
	layoutPreset?: StoredMusicLayout
	videoLayoutPreset?: StoredVideoLayout
}
