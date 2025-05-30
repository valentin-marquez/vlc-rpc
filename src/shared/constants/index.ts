import type { AppConfig } from "@shared/types"

/**
 * Default application configuration
 */
export const DEFAULT_CONFIG: AppConfig = {
	clientId: "1345358480671772683",
	largeImage: "logo",
	pausedImage: "paused",
	playingImage: "playing",
	presenceUpdateInterval: 1,
	fastCheckInterval: 1,
	statusTimeout: 5,
	vlc: {
		httpPort: 9080,
		httpPassword: "",
		httpEnabled: false,
	},
	isFirstRun: true,
	minimizeToTray: true,
	startWithSystem: true,
	version: "3.0.0", // Default version, will be overridden at runtime
	rpcEnabled: true, // RPC enabled by default
	persistRpcTimersOnRestart: false, // Don't persist timers by default (more intuitive behavior)
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
