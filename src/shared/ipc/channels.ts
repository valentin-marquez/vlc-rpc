import type { AppConfig, VlcConfig } from "@shared/config/app-config"
import type { DetectedMediaInfo } from "@shared/media/media.types"
import type { VlcConnectionStatus, VlcStatus } from "@shared/vlc/vlc.types"

// ─── Invoke Channels (Renderer → Main, request/response) ────────────────────

/**
 * IPC Contract Map: single source of truth for all invoke-based IPC channels.
 *
 * Each key is the exact channel string used by `ipcMain.handle` / `ipcRenderer.invoke`.
 * The value defines the request args tuple and the response type.
 *
 * To add a new channel:
 *   1. Add an entry here with its request/response types.
 *   2. The compiler will force you to implement the handler (main) and bridge (preload).
 */
export interface IpcInvokeChannelMap {
	// ── Config ──────────────────────────────────────────────────────────────
	"config:get": { request: [key?: string]; response: AppConfig | unknown }
	"config:set": { request: [key: string, value: unknown]; response: boolean }

	// ── VLC Config ──────────────────────────────────────────────────────────
	"vlc:config:get": { request: []; response: VlcConfig }
	"vlc:config:set": { request: [config: VlcConfig]; response: boolean }

	// ── VLC Status ──────────────────────────────────────────────────────────
	"vlc:status:get": { request: [forceUpdate?: boolean]; response: VlcStatus | null }
	"vlc:status:check": { request: []; response: VlcConnectionStatus }

	// ── Discord RPC ─────────────────────────────────────────────────────────
	"discord:connect": { request: []; response: boolean }
	"discord:disconnect": { request: []; response: boolean }
	"discord:status": { request: []; response: boolean }
	"discord:update": { request: []; response: boolean }
	"discord:start-loop": { request: []; response: boolean }
	"discord:stop-loop": { request: []; response: boolean }
	"discord:reconnect": { request: []; response: boolean }
	"discord:rpc:enable": { request: []; response: boolean }
	"discord:rpc:disable": { request: []; response: boolean }
	"discord:rpc:disable:temporary": { request: [minutes: number]; response: boolean }
	"discord:rpc:status": { request: []; response: boolean }

	// ── Media ───────────────────────────────────────────────────────────────
	"media:get-info": { request: []; response: (VlcStatus & DetectedMediaInfo) | null }

	// ── Image ───────────────────────────────────────────────────────────────
	"image:proxy": { request: [url: string]; response: string | null }

	// ── Metadata ────────────────────────────────────────────────────────────
	"metadata:clear-cache": {
		request: []
		response: { success: boolean; message: string; filesRemoved: number }
	}
	"metadata:get-stats": {
		request: []
		response: {
			success: boolean
			stats: {
				totalFiles: number
				expiredFiles: number
				cacheSizeKB: number
				cacheSizeBytes: number
			}
		}
	}
	"metadata:cleanup-expired": {
		request: []
		response: { success: boolean; message: string; filesRemoved: number }
	}

	// ── Update ──────────────────────────────────────────────────────────────
	"update:check": { request: [silent?: boolean]; response: boolean }
	"update:download": { request: []; response: boolean }
	"update:force-check": { request: []; response: boolean }
	"update:status": {
		request: []
		response: {
			isPortable: boolean
			updateCheckInProgress: boolean
			retryCount: number
			currentVersion: string
		}
	}
	"update:installation-type": { request: []; response: "portable" | "setup" }
	"update:open-cache-folder": { request: []; response: undefined }

	// ── Window ──────────────────────────────────────────────────────────────
	"window:minimize": { request: []; response: undefined }
	"window:maximize": { request: []; response: undefined }
	"window:close": { request: []; response: undefined }
	"window:is-maximized": { request: []; response: boolean }

	// ── System ──────────────────────────────────────────────────────────────
	"system:platform": { request: []; response: string }
	"app:is-portable": { request: []; response: boolean }
}

// ─── Push Events (Main → Renderer, one-way) ────────────────────────────────

/**
 * Events pushed from main to renderer via `webContents.send` / `ipcRenderer.on`.
 *
 * Each key is the event channel string. The value is the payload type.
 */
export interface IpcEventMap {
	"window:maximized-change": boolean
	"update:checking-for-update": unknown
	"update:update-available": unknown
	"update:update-not-available": unknown
	"update:download-progress": unknown
	"update:update-downloaded": unknown
	"update:error": unknown
}
