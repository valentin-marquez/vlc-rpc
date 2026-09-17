import { createHash } from "node:crypto"
import { configService } from "@main/core/config"
import { logger } from "@main/core/logger"
import type { VlcConnectionReason, VlcConnectionStatus, VlcStatus } from "@shared/vlc/vlc.types"
import { detectVideoStream } from "./vlc.mapper"
import type { VlcMetadata, VlcPlaylistItem, VlcPlaylistResponse, VlcRawStatus } from "./vlc.types"

/** Drops a trailing media extension, and only that: a dot inside a title stays. */
function stripExtension(filename: string): string {
	return filename.replace(/\.[a-z0-9]{2,4}$/i, "")
}

/**
 * Node's fetch throws `TypeError: fetch failed` and hangs the socket error off
 * `cause`, so the refused connection that means "VLC is not open" sits one or
 * two levels down. Reading only the top level is what made the commonest state
 * of all classify itself as an unknown error.
 */
function reasonForRequestFailure(error: unknown): VlcConnectionReason {
	const seen = new Set<unknown>()
	let current = error

	while (typeof current === "object" && current !== null && !seen.has(current)) {
		seen.add(current)
		const { name, code, cause } = current as { name?: unknown; code?: unknown; cause?: unknown }

		if (name === "AbortError" || name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT") {
			return "timeout"
		}
		if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ECONNABORTED") {
			return "not-running"
		}

		current = cause
	}

	return "unknown-error"
}

export class Client {
	private lastStatusHash = ""
	private lastStatus: VlcStatus | null = null
	private baseUrl = ""
	private authHeader: Record<string, string> = {}

	constructor() {
		this.updateConnectionInfo()
	}

	public updateConnectionInfo(): void {
		const vlcConfig = configService.get("vlc")
		this.baseUrl = `http://localhost:${vlcConfig.httpPort}/requests/`
		this.authHeader = this.createAuthHeader(vlcConfig.httpPassword)
		logger.info(`VLC status service configured for ${this.baseUrl}`)
		logger.info(`Auth headers created: ${Object.keys(this.authHeader).length > 0 ? "Yes" : "No"}`)
	}

	private createAuthHeader(password: string): Record<string, string> {
		// VLC authenticates with an empty username and the password alone.
		const username = ""
		const authString = `${username}:${password || ""}`
		const base64Auth = Buffer.from(authString).toString("base64")

		// The password itself, and even its length, stays out of the log: only
		// whether one is set is worth knowing here.
		logger.info(`Creating auth header (password set: ${password ? "yes" : "no"})`)

		return {
			Authorization: `Basic ${base64Auth}`,
			Accept: "application/json",
		}
	}

	/**
	 * Timeout for a single request to VLC, from config, clamped so a corrupt
	 * or missing value cannot hang a request forever or make the app hammer
	 * VLC with sub-second aborts.
	 */
	private statusTimeoutMs(): number {
		const configured = configService.get("statusTimeout")
		return Math.max(500, Math.min(10000, configured || 2000))
	}

	/** `forceUpdate` reparses even when the response hashes the same as the last one. */
	public async readStatus(forceUpdate = false): Promise<VlcStatus | null> {
		const vlcConfig = configService.get("vlc")

		if (!vlcConfig.httpEnabled) {
			logger.warn("VLC HTTP interface is not enabled")
			return null
		}

		try {
			const statusUrl = new URL("status.json", this.baseUrl).toString()
			logger.info(`Fetching VLC status from: ${statusUrl}`)

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.statusTimeoutMs())

			logger.info(
				`Making request with headers: ${JSON.stringify({
					...this.authHeader,
					Authorization: this.authHeader.Authorization ? "Basic ***" : undefined,
				})}`,
			)

			const response = await fetch(statusUrl, {
				headers: this.authHeader,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			logger.info(`VLC response status: ${response.status}`)

			if (response.status !== 200) {
				if (response.status === 404) {
					logger.info("VLC is not running or HTTP interface is misconfigured")
				} else if (response.status === 401) {
					logger.error(
						`Authentication failed. Check your HTTP password. Auth header: ${this.authHeader.Authorization ? "Present" : "Missing"}`,
					)
					return await this.retryWithAlternativeAuth(statusUrl)
				} else {
					logger.error(`Failed to get VLC status: HTTP ${response.status}`)
				}
				return null
			}

			const content = await response.text()
			logger.info(`Received content size: ${content.length} bytes`)

			const contentHash = createHash("md5").update(content).digest("hex")

			if (contentHash === this.lastStatusHash && !forceUpdate && this.lastStatus) {
				return this.lastStatus
			}

			this.lastStatusHash = contentHash
			const vlcStatus: VlcRawStatus = JSON.parse(content)

			const status = this.convertVlcStatus(vlcStatus)
			this.lastStatus = status
			logger.info("Successfully parsed VLC status")
			return status
		} catch (error: unknown) {
			const err = error as Error & { code?: string }
			if (err.name === "AbortError") {
				logger.info("Connection to VLC timed out")
			} else if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
				logger.info("VLC is not running or HTTP interface is not accessible")
				logger.warn(`Error reading VLC status: ${error}`)
			} else if (error instanceof SyntaxError) {
				logger.error("Invalid JSON in VLC response")
			} else {
				logger.warn(`Error reading VLC status: ${error}`)
			}
			return null
		}
	}

	/** VLC can be picky about auth formats, so a 401 is retried with the credentials in the URL. */
	private async retryWithAlternativeAuth(statusUrl: string): Promise<VlcStatus | null> {
		try {
			logger.info("Trying alternative authentication method...")
			const vlcConfig = configService.get("vlc")

			const urlWithAuth = new URL(statusUrl)
			urlWithAuth.username = ""
			urlWithAuth.password = vlcConfig.httpPassword || ""

			logger.info(
				`Retrying with URL-based auth: ${urlWithAuth.toString().replace(/\/\/.+?@/, "//<redacted>@")}`,
			)

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.statusTimeoutMs())

			const response = await fetch(urlWithAuth.toString(), {
				signal: controller.signal,
				headers: { Accept: "application/json" },
			})

			clearTimeout(timeoutId)

			if (response.status === 200) {
				logger.info("Alternative authentication method successful")
				const content = await response.text()
				const vlcStatus: VlcRawStatus = JSON.parse(content)

				const status = this.convertVlcStatus(vlcStatus)
				this.lastStatus = status
				this.lastStatusHash = createHash("md5").update(content).digest("hex")

				this.updateAuthStrategy(vlcConfig.httpPassword)

				return status
			}
			logger.error(`Alternative auth failed with status: ${response.status}`)
			return null
		} catch (error) {
			logger.error(`Error with alternative auth: ${error}`)
			return null
		}
	}

	private updateAuthStrategy(password: string): void {
		const username = ""
		const authString = `${username}:${password || ""}`
		const base64Auth = Buffer.from(authString).toString("base64")

		this.authHeader = {
			Authorization: `Basic ${base64Auth}`,
			Accept: "application/json",
		}

		logger.info("Updated authentication strategy")
	}

	private convertVlcStatus(vlcStatus: VlcRawStatus): VlcStatus {
		const state = vlcStatus.state || "stopped"
		const time = Number.parseInt(String(vlcStatus.time || 0), 10)
		const length = Number.parseInt(String(vlcStatus.length || 0), 10)
		const position = vlcStatus.position || 0
		const rate = vlcStatus.rate || 1
		const plid =
			vlcStatus.currentplid !== undefined && vlcStatus.currentplid >= 0
				? vlcStatus.currentplid
				: null

		const status: VlcStatus = {
			active: state !== "stopped",
			status: state,
			timestamp: Math.floor(Date.now() / 1000),
			plid,
			playback: {
				position,
				time,
				duration: length,
				rate,
			},
			mediaType: "audio",
			media: {},
		}

		const information = vlcStatus.information || {}
		const category = information.category || {}

		// See detectVideoStream: matches by shape, not by VLC's localized field names.
		const { isVideo, videoInfo } = detectVideoStream(category)

		status.mediaType = isVideo ? "video" : "audio"
		status.videoInfo = videoInfo
		logger.info(`Media type detected: ${status.mediaType}`)

		const meta = (category.meta as VlcMetadata) || {}

		if (meta) {
			// The filename is the last resort, and it arrives with its extension.
			// Leaving it on puts ".mp3" on the user's profile, which is the exact
			// thing reading the tags is meant to avoid.
			status.media.title =
				meta.title ||
				meta.showName ||
				meta.movie_name ||
				meta.anime_name ||
				(meta.filename ? stripExtension(meta.filename) : "") ||
				"Unknown"

			status.media.artist = meta.artist || ""
			status.media.album = meta.album || ""

			// An image this app uploaded outranks the local one, until it expires.
			if (meta["X-COVER-URL"]) {
				const expiryDate = meta["X-EXPIRY-DATE"]
				let isExpired = false

				if (expiryDate) {
					try {
						const expiry = new Date(expiryDate)
						isExpired = expiry.getTime() < Date.now()
					} catch {
						// Invalid date format, assume not expired
					}
				}

				if (!isExpired) {
					status.media.artworkUrl = meta["X-COVER-URL"]
					logger.info(`Using uploaded cover image: ${meta["X-COVER-URL"]}`)
				} else {
					logger.info("Uploaded cover image has expired, will use local artwork")
					status.media.artworkUrl = meta.artwork_url
				}
			} else {
				status.media.artworkUrl = meta.artwork_url
			}
		}

		logger.info(`Final media type: ${status.mediaType} for "${status.media.title}"`)

		if (meta["X-COVER-URL"]) {
			logger.info(
				`Custom metadata found - App: ${meta["X-PROCESSED-BY"]}, Version: ${meta["X-APP-VERSION"]}`,
			)
		}

		return status
	}

	/** The URI of the item the playlist marks as current, which status.json does not carry. */
	public async getCurrentFileUri(): Promise<string | null> {
		const vlcConfig = configService.get("vlc")

		if (!vlcConfig.httpEnabled) {
			logger.warn("VLC HTTP interface is not enabled")
			return null
		}

		try {
			const playlistUrl = new URL("playlist.json", this.baseUrl).toString()

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.statusTimeoutMs())

			const response = await fetch(playlistUrl, {
				headers: this.authHeader,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (response.status !== 200) {
				logger.error(`Failed to get VLC playlist: HTTP ${response.status}`)
				return null
			}

			const content = await response.text()
			const playlist: VlcPlaylistResponse = JSON.parse(content)

			const currentItem = this.findCurrentPlayingItem(playlist)
			if (currentItem?.uri) {
				return currentItem.uri
			}

			logger.info("No current playing item found in playlist")
			return null
		} catch (error) {
			// Never the error itself: CONTRIBUTING forbids it because a failed
			// request carries the address it was made against.
			const name = error instanceof Error ? error.name : "unknown error"
			logger.error(`Could not read the VLC playlist: ${name}`)
			return null
		}
	}

	private findCurrentPlayingItem(item: VlcPlaylistResponse): VlcPlaylistItem | null {
		if ("current" in item && (item as VlcPlaylistItem).current === "current") {
			return item as VlcPlaylistItem
		}

		if (item.children) {
			for (const child of item.children) {
				const found = this.findCurrentPlayingItem(child as VlcPlaylistResponse)
				if (found) {
					return found
				}
			}
		}

		return null
	}
	public async checkVlcStatus(): Promise<VlcConnectionStatus> {
		const vlcConfig = configService.get("vlc")

		if (!vlcConfig.httpEnabled) {
			return { isRunning: false, reason: "not-configured" }
		}

		try {
			const statusUrl = new URL("status.json", this.baseUrl).toString()

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.statusTimeoutMs())

			const response = await fetch(statusUrl, {
				headers: this.authHeader,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			switch (response.status) {
				case 200:
					return { isRunning: true, reason: "running" }
				case 401:
					return { isRunning: false, reason: "auth-failed" }
				case 404:
					return { isRunning: false, reason: "misconfigured-endpoint" }
				default:
					return { isRunning: false, reason: "unexpected-status" }
			}
		} catch (error: unknown) {
			return { isRunning: false, reason: reasonForRequestFailure(error) }
		}
	}
}
