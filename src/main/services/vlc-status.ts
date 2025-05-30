import { createHash } from "node:crypto"
import { configService } from "@main/services/config"
import { logger } from "@main/services/logger"
import type { VlcConfig } from "@shared/types"
import type { VlcConnectionStatus, VlcRawStatus, VlcStatus } from "@shared/types/vlc"

interface VlcMetadata {
	title?: string
	filename?: string
	artist?: string
	album?: string
	artwork_url?: string
	[key: string]: string | undefined
}

interface VlcStream {
	Type?: string
	Video_resolution?: string
	[key: string]: string | undefined
}

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

		// Improved video detection with multiple methods
		let isVideo = false

		// Method 1: Check for video streams in category
		isVideo = Object.entries(category).some(([key, stream]) => {
			if (key !== "meta" && stream) {
				const typedStream = stream as VlcStream
				return typedStream.Type === "Video"
			}
			return false
		})

		// Method 2: Check filename extension if stream detection fails
		const meta = (category.meta as VlcMetadata) || {}
		if (!isVideo && meta) {
			const filename = meta.filename || meta.title || ""
			const videoExtensions = [
				".mp4",
				".mkv",
				".avi",
				".mov",
				".wmv",
				".flv",
				".webm",
				".m4v",
				".mpg",
				".mpeg",
				".3gp",
				".ogv",
				".ts",
				".m2ts",
				".mts",
				".vob",
				".divx",
				".xvid",
				".asf",
				".rm",
				".rmvb",
			]

			isVideo = videoExtensions.some((ext) => filename.toLowerCase().includes(ext.toLowerCase()))

			if (isVideo) {
				logger.info(`Detected video by file extension: ${filename}`)
			}
		}

		// Method 3: Check for video-related metadata
		if (!isVideo && meta) {
			const title = meta.title || meta.filename || ""
			const videoIndicators = [
				// TV Show patterns
				/S\d{1,2}E\d{1,2}/i, // S01E01
				/\d{1,2}x\d{1,2}/i, // 1x01
				/Season\s*\d+/i, // Season 1
				/Episode\s*\d+/i, // Episode 1
				// Movie patterns
				/(19|20)\d{2}.*\.(mp4|mkv|avi)/i, // Year in filename with video extension
				// Quality indicators (usually video)
				/\b(720p|1080p|4K|UHD|BluRay|WEB-DL|HDRip|BRRip)\b/i,
				// Video codecs
				/\b(x264|x265|HEVC|h264|h265)\b/i,
			]

			isVideo = videoIndicators.some((pattern) => pattern.test(title))

			if (isVideo) {
				logger.info(`Detected video by content pattern: ${title}`)
			}
		}

		// Method 4: Duration-based heuristic (videos tend to be longer)
		if (!isVideo && length > 0) {
			// If duration > 10 minutes and no explicit audio markers, likely video
			const durationMinutes = length / 60
			const hasAudioMarkers = meta.artist || meta.album

			if (durationMinutes > 10 && !hasAudioMarkers) {
				isVideo = true
				logger.info(`Detected video by duration heuristic: ${durationMinutes.toFixed(1)} minutes`)
			}
		}

		status.mediaType = isVideo ? "video" : "audio"

		if (meta) {
			status.media.title = meta.title || meta.filename || "Unknown"
			status.media.artist = meta.artist || ""
			status.media.album = meta.album || ""

			if (meta.artwork_url) {
				status.media.artworkUrl = meta.artwork_url
			}
		}

		// Extract video resolution info
		for (const [streamName, stream] of Object.entries(category)) {
			if (streamName !== "meta" && stream) {
				const typedStream = stream as VlcStream
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

		logger.info(`Media type detected: ${status.mediaType} for "${status.media.title}"`)
		return status
	}

	/**
	 * Check VLC status and return diagnostic information
	 *
	 * @returns Status check result with connection information
	 */
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
