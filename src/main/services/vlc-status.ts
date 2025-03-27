import { createHash } from "node:crypto"
import { configService } from "@main/services/config"
import { logger } from "@main/services/logger"
import type { VlcConfig } from "@shared/types"
import type { VlcConnectionStatus, VlcRawStatus, VlcStatus } from "@shared/types/vlc"

// Define types for VLC metadata objects
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
		// Log auth header (but mask password value)
		logger.info(`Auth headers created: ${Object.keys(this.authHeader).length > 0 ? "Yes" : "No"}`)
	}

	/**
	 * Create the HTTP Basic Auth header for VLC
	 */
	private createAuthHeader(password: string): Record<string, string> {
		// VLC requires empty username and password in a specific format
		// To ensure we're building the auth string correctly, we'll be more explicit

		// Even if password is empty, VLC still requires Basic auth with empty password
		const username = "" // VLC uses empty username
		const authString = `${username}:${password || ""}`
		const base64Auth = Buffer.from(authString).toString("base64")

		// Log the auth string creation (without exposing the password)
		logger.info(
			`Creating auth header with username: '' and password length: ${password ? password.length : 0}`,
		)

		return {
			Authorization: `Basic ${base64Auth}`,
			// Add standard headers to help with request
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

			// Using native fetch (available in Node.js since 18.x)
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

			// Log complete request details for debugging
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
					// Show more debug information about the auth failure
					logger.error(
						`Authentication failed. Check your HTTP password. Auth header: ${this.authHeader.Authorization ? "Present" : "Missing"}`,
					)

					// Try again with a different auth approach if the current one fails
					return await this.retryWithAlternativeAuth(statusUrl)
				} else {
					logger.error(`Failed to get VLC status: HTTP ${response.status}`)
				}
				return null
			}

			const content = await response.text()
			logger.info(`Received content size: ${content.length} bytes`)

			const contentHash = createHash("md5").update(content).digest("hex")

			// Use cached status if hash hasn't changed and we're not forcing an update
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
			} else if (error instanceof SyntaxError) {
				logger.error("Invalid JSON in VLC response")
			} else {
				logger.error(`Error reading VLC status: ${error}`)
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

			// Try with URL-based authentication which sometimes works better
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

				// Update our auth approach for future requests
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
		// Modify auth header creation based on successful strategy
		// This would be populated with whatever auth approach worked
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

		// Determine if video or audio
		const isVideo = Object.entries(category).some(([key, stream]) => {
			if (key !== "meta" && stream) {
				const typedStream = stream as VlcStream
				return typedStream.Type === "Video"
			}
			return false
		})

		status.mediaType = isVideo ? "video" : "audio"

		// Extract metadata
		const meta = (category.meta as VlcMetadata) || {}
		if (meta) {
			status.media.title = meta.title || meta.filename || "Unknown"
			status.media.artist = meta.artist || ""
			status.media.album = meta.album || ""

			if (meta.artwork_url) {
				status.media.artworkUrl = meta.artwork_url
			}
		}

		// Extract video resolution if available
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
					// Add return for non-connection errors to prevent fall-through
					return { isRunning: false, message: `Error checking VLC status: ${err.message}` }
				default:
					return { isRunning: false, message: `Error checking VLC status: ${err.message}` }
			}
		}
	}
}

export const vlcStatusService = VlcStatusService.getInstance()
