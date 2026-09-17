import type { AppConfig } from "@shared/config/app-config"
import { DEFAULT_MUSIC_CHOICE, DEFAULT_VIDEO_CHOICE } from "@shared/presence/layout"

/**
 * Default application configuration
 */
export const DEFAULT_CONFIG: AppConfig = {
	largeImage: "logo",
	pausedImage: "paused",
	playingImage: "playing",
	presenceUpdateInterval: 1500,
	statusTimeout: 2000,
	vlc: {
		httpPort: 9080,
		httpPassword: "",
		httpEnabled: false,
	},
	isFirstRun: true,
	minimizeToTray: true,
	startWithSystem: true,
	version: "3.0.0", // Default version, will be overridden at runtime
	fileMetadata: {}, // Empty object for file metadata storage
	rpcEnabled: true,
	// A name rather than a copy of the lines, so a later release can improve the
	// arrangement a fresh install starts on.
	layoutPreset: DEFAULT_MUSIC_CHOICE,
	videoLayoutPreset: DEFAULT_VIDEO_CHOICE,
}

/**
 * Configuration file name
 */
export const CONFIG_NAME = "vlc-rpc-config"

/**
 * VLC Configuration file name based on OS
 */
export const VLC_CONFIG_PATHS = {
	win32: "%APPDATA%\\vlc\\vlcrc",
	darwin: "~/Library/Preferences/org.videolan.vlc/vlcrc",
	linux: "~/.config/vlc/vlcrc",
}
