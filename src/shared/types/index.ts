/**
 * IPC Channels for communication between main and renderer processes
 */
export enum IpcChannels {
	CONFIG = "config",
	VLC = "vlc",
	DISCORD = "discord",
	LOG = "log",
	MEDIA = "media",
	IMAGE = "image",
	UPDATE = "update",
	METADATA = "metadata",
}

/**
 * IPC Events for specific operations
 */
export enum IpcEvents {
	PING = "ping",
	LOG = "log",
	CONFIG_GET = "config:get",
	CONFIG_SET = "config:set",
	VLC_CONFIG_GET = "vlc:config:get",
	VLC_CONFIG_SET = "vlc:config:set",
	VLC_STATUS_GET = "vlc:status:get",
	VLC_STATUS_CHECK = "vlc:status:check",
	IMAGE_PROXY = "image:proxy",
	// Metadata management events
	METADATA_CLEAR_CACHE = "clear:cache",
	METADATA_GET_STATS = "get:stats",
	METADATA_CLEANUP_EXPIRED = "cleanup:expired",
	// RPC control events
	RPC_ENABLE = "rpc:enable",
	RPC_DISABLE = "rpc:disable",
	RPC_DISABLE_TEMPORARY = "rpc:disable:temporary",
	RPC_STATUS = "rpc:status",
}

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
}

/**
 * Log levels
 */
export enum LogLevel {
	ERROR = "error",
	WARN = "warn",
	INFO = "info",
	DEBUG = "debug",
}

/**
 * Generic connection status
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

/**
 * Application status
 */
export type AppStatus = "idle" | "loading" | "ready" | "error"
