import type { AppConfig, VlcConfig } from "@shared/config/app-config"
import type { DetectedMediaInfo } from "@shared/media/media.types"
import type { LastSentPresence } from "@shared/presence/presence.types"
import type { VlcConnectionStatus, VlcStatus } from "@shared/vlc/vlc.types"

// ─── Overrides ──────────────────────────────────────────────────────────────

/**
 * The store's own types live in `@main/features/overrides` and cannot be
 * imported here: `shared` is compiled for the renderer too, which has no
 * `@main` path. The shapes are restated instead, and `overrides.handler.ts`
 * hands the store's types straight to `registerHandler`, so a divergence
 * between the two breaks the build there rather than at runtime.
 */
export type OverrideDraft =
	| {
			kind: "video"
			title?: string | undefined
			cover?: string | undefined
			mediaKind?: "movie" | "tv" | undefined
			sourceFilename: string
	  }
	| { kind: "audio"; cover: string; sourceFilename: string }
	/**
	 * Audio with no tags of its own, where the correction carries what the file
	 * is. The cover is optional here on purpose: given the artist and the title
	 * the ordinary lookup finds the artwork, and typing two words beats going to
	 * find an image address.
	 */
	| {
			kind: "untagged-audio"
			title?: string | undefined
			artist?: string | undefined
			cover?: string | undefined
			sourceFilename: string
	  }
	/**
	 * The user refusing what the app matched a file to. It carries no fields
	 * because the whole of what it says is that the file speaks for itself, and
	 * it is still a correction: it is filed, listed and removed like any other.
	 */
	| { kind: "as-is"; sourceFilename: string }

export type SavedOverride = OverrideDraft & { savedAt: number }

export interface OverrideListEntry {
	key: string
	override: SavedOverride
}

/**
 * Three cover failures kept apart rather than collapsed into "invalid URL",
 * because each asks the user for a different move: retype what they pasted,
 * check a link that is dead or a host that is down, or copy the image address
 * instead of the page the image sits on. `store-refused` is the store's own
 * guard against a key that carries no title.
 */
export type OverrideSaveResult =
	| { saved: true }
	| { saved: false; reason: "cover-not-a-url" }
	| { saved: false; reason: "cover-unreachable"; status: number | null }
	| { saved: false; reason: "cover-not-an-image"; contentType: string | null }
	| { saved: false; reason: "store-refused" }

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
	"discord:presence:last": { request: []; response: LastSentPresence }

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

	// ── Overrides ───────────────────────────────────────────────────────────
	"overrides:list": { request: []; response: OverrideListEntry[] }
	"overrides:save": {
		request: [key: string, override: OverrideDraft]
		response: OverrideSaveResult
	}
	"overrides:delete": { request: [key: string]; response: boolean }

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
	"update:install": { request: []; response: boolean }
	"update:open-release-page": { request: []; response: undefined }

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
