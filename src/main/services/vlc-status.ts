import { createHash } from "node:crypto"
import { configService } from "@main/services/config"
import { logger } from "@main/services/logger"
import type { VlcConfig } from "@shared/types"
import type {
	VlcConnectionStatus,
	VlcMetadata,
	VlcPlaylistItem,
	VlcPlaylistResponse,
	VlcRawStatus,
	VlcStatus,
	VlcStreamInfo,
} from "@shared/types/vlc"

/**
 * Service to read and process VLC media status through HTTP interface
 */
export class VlcStatusService {
	private static instance: VlcStatusService | null = null
	private lastStatusHash = ""
	private lastStatus: VlcStatus | null = null
	private baseUrl = ""
	private authHeader: Record<string, string> = {}

	private constructor() {
		this.updateConnectionInfo()
	}

	/**
	 * Get the singleton instance of the VLC status service
	 */
	public static getInstance(): VlcStatusService {
		if (!VlcStatusService.instance) {
			VlcStatusService.instance = new VlcStatusService()
		}
		return VlcStatusService.instance
	}

	/**
	 * Update connection information based on current VLC config
	 */
	public updateConnectionInfo(): void {
		const vlcConfig = configService.get<VlcConfig>("vlc")
		this.baseUrl = `http://localhost:${vlcConfig.httpPort}/requests/`
		this.authHeader = this.createAuthHeader(vlcConfig.httpPassword)
		logger.info(`VLC status service configured for ${this.baseUrl}`)
		logger.info(`Auth headers created: ${Object.keys(this.authHeader).length > 0 ? "Yes" : "No"}`)
	}

	/**
	 * Create the HTTP Basic Auth header for VLC
	 */
	private createAuthHeader(password: string): Record<string, string> {
		// VLC requires empty username and password in a specific format
		const username = ""
		const authString = `${username}:${password || ""}`
		const base64Auth = Buffer.from(authString).toString("base64")

		logger.info(
			`Creating auth header with username: '' and password length: ${password ? password.length : 0}`,
		)

		return {
			Authorization: `Basic ${base64Auth}`,
			Accept: "application/json",
		}
	}

	/**
	 * Read VLC status through HTTP interface
	 *
	 * @param forceUpdate Whether to force an update even if hash hasn't changed
	 * @returns Parsed status information or null if unavailable
	 */
	public async readStatus(forceUpdate = false): Promise<VlcStatus | null> {
		const vlcConfig = configService.get<VlcConfig>("vlc")

		if (!vlcConfig.httpEnabled) {
			logger.warn("VLC HTTP interface is not enabled")
			return null
		}

		try {
			const statusUrl = new URL("status.json", this.baseUrl).toString()
			logger.info(`Fetching VLC status from: ${statusUrl}`)

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000)

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

	/**
	 * Try an alternative authentication approach
	 * VLC can be picky about auth formats
	 */
	private async retryWithAlternativeAuth(statusUrl: string): Promise<VlcStatus | null> {
		try {
			logger.info("Trying alternative authentication method...")
			const vlcConfig = configService.get<VlcConfig>("vlc")

			const urlWithAuth = new URL(statusUrl)
			urlWithAuth.username = ""
			urlWithAuth.password = vlcConfig.httpPassword || ""

			logger.info(
				`Retrying with URL-based auth: ${urlWithAuth.toString().replace(/\/\/.+?@/, "//<redacted>@")}`,
			)

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000)

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

	/**
	 * Update authentication strategy based on what works
	 */
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

	/**
	 * Convert VLC HTTP API status format to our internal format
	 * Uses VLC stream information for reliable content type detection
	 */
	private convertVlcStatus(vlcStatus: VlcRawStatus): VlcStatus {
		const state = vlcStatus.state || "stopped"
		const time = Number.parseInt(String(vlcStatus.time || 0), 10)
		const length = Number.parseInt(String(vlcStatus.length || 0), 10)
		const position = vlcStatus.position || 0

		const status: VlcStatus = {
			active: state !== "stopped",
			status: state,
			timestamp: Math.floor(Date.now() / 1000),
			playback: {
				position,
				time,
				duration: length,
			},
			mediaType: "audio",
			media: {},
		}

		const information = vlcStatus.information || {}
		const category = information.category || {}

		// Simple and reliable media type detection using VLC stream information
		let isVideo = false

		// Check all streams in the category to determine media type
		for (const [key, stream] of Object.entries(category)) {
			if (key !== "meta" && stream) {
				const typedStream = stream as VlcStreamInfo
				if (typedStream.Type === "Video") {
					isVideo = true
					logger.info(`Found video stream: ${typedStream.Codec}`)
					break // If we find a video stream, it's definitely video content
				}
			}
		}

		status.mediaType = isVideo ? "video" : "audio"
		logger.info(`Media type detected: ${status.mediaType}`)

		// Get metadata from VLC
		const meta = (category.meta as VlcMetadata) || {}

		// Enhanced media information extraction
		if (meta) {
			// Prioritize specific metadata fields over generic ones
			status.media.title =
				meta.title ||
				meta.showName ||
				meta.movie_name ||
				meta.anime_name ||
				meta.filename ||
				"Unknown"

			status.media.artist = meta.artist || ""
			status.media.album = meta.album || ""

			// Handle artwork URL - prioritize our uploaded images
			if (meta["X-COVER-URL"]) {
				// Check if our uploaded image is still valid
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
				// Use local artwork URL if available
				status.media.artworkUrl = meta.artwork_url
			}
		}

		// Extract video resolution info
		for (const [streamName, stream] of Object.entries(category)) {
			if (streamName !== "meta" && stream) {
				const typedStream = stream as VlcStreamInfo
				if (typedStream.Type === "Video") {
					const resolution = typedStream.Video_resolution || ""
					if (resolution?.includes("x")) {
						const [width, height] = resolution.split("x").map((dim) => Number.parseInt(dim, 10))
						status.videoInfo = { width, height }
						break
					}
				}
			}
		}

		logger.info(`Final media type: ${status.mediaType} for "${status.media.title}"`)

		// Log enhanced metadata for debugging
		if (meta["X-COVER-URL"]) {
			logger.info(
				`Custom metadata found - App: ${meta["X-PROCESSED-BY"]}, Version: ${meta["X-APP-VERSION"]}`,
			)
		}

		return status
	}

	/**
	 * Get the current playing file URI from VLC playlist
	 * @returns The file URI of the currently playing item or null
	 */
	public async getCurrentFileUri(): Promise<string | null> {
		const vlcConfig = configService.get<VlcConfig>("vlc")

		if (!vlcConfig.httpEnabled) {
			logger.warn("VLC HTTP interface is not enabled")
			return null
		}

		try {
			const playlistUrl = new URL("playlist.json", this.baseUrl).toString()
			logger.info(`Fetching VLC playlist from: ${playlistUrl}`)

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000)

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

			// Find the current playing item
			const currentItem = this.findCurrentPlayingItem(playlist)
			if (currentItem?.uri) {
				logger.info(`Current playing file: ${currentItem.uri}`)
				return currentItem.uri
			}

			logger.info("No current playing item found in playlist")
			return null
		} catch (error) {
			logger.error(`Error getting current file URI: ${error}`)
			return null
		}
	}

	/**
	 * Recursively search for the current playing item in the playlist
	 * @param item - Playlist item to search
	 * @returns The current playing item or null
	 */
	private findCurrentPlayingItem(item: VlcPlaylistResponse): VlcPlaylistItem | null {
		// Check if this item is marked as current
		if ("current" in item && (item as VlcPlaylistItem).current === "current") {
			return item as VlcPlaylistItem
		}

		// Search in children
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
		const vlcConfig = configService.get<VlcConfig>("vlc")

		if (!vlcConfig.httpEnabled) {
			return { isRunning: false, message: "VLC HTTP interface is not enabled in configuration" }
		}

		try {
			const statusUrl = new URL("status.json", this.baseUrl).toString()

			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000)

			const response = await fetch(statusUrl, {
				headers: this.authHeader,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			switch (response.status) {
				case 200:
					return { isRunning: true, message: "VLC is running and HTTP interface is accessible" }
				case 401:
					return {
						isRunning: false,
						message: "VLC is running but authentication failed (incorrect password)",
					}
				case 404:
					return {
						isRunning: false,
						message: "VLC is running but the HTTP interface is not properly configured",
					}
				default:
					return {
						isRunning: false,
						message: `VLC returned unexpected status code: ${response.status}`,
					}
			}
		} catch (error: unknown) {
			const err = error as { name: string; code?: string; message: string }
			switch (err.name) {
				case "AbortError":
					return { isRunning: false, message: "Connection to VLC timed out" }
				case "Error":
					if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
						return {
							isRunning: false,
							message: "VLC is not running or HTTP interface is not enabled",
						}
					}
					return { isRunning: false, message: `Error checking VLC status: ${err.message}` }
				default:
					return { isRunning: false, message: `Error checking VLC status: ${err.message}` }
			}
		}
	}
}

export const vlcStatusService = VlcStatusService.getInstance()
