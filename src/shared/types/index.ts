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
 * Application configuration schema
 */
export interface AppConfig {
	clientId: string
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
