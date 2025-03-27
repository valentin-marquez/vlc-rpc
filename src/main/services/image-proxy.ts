import { promises as fs } from "node:fs"
import { logger } from "./logger"

/**
 * Service for proxying images from various sources to data URLs
 * to avoid Content Security Policy restrictions
 */
export class ImageProxyService {
	private static instance: ImageProxyService | null = null
	private cache: Map<string, { dataUrl: string; timestamp: number }> = new Map()
	private readonly cacheTtl = 3600 // Cache TTL in seconds (1 hour)

	private constructor() {
		logger.info("Image proxy service initialized")
	}

	/**
	 * Get the singleton instance of the image proxy service
	 */
	public static getInstance(): ImageProxyService {
		if (!ImageProxyService.instance) {
			ImageProxyService.instance = new ImageProxyService()
		}
		return ImageProxyService.instance
	}

	/**
	 * Convert a URL or file path to a data URL
	 */
	public async getImageAsDataUrl(source: string | null | undefined): Promise<string | null> {
		if (!source) {
			return null
		}

		// Check cache first
		const cached = this.cache.get(source)
		if (cached && Date.now() / 1000 - cached.timestamp < this.cacheTtl) {
			logger.info(`Using cached image data for: ${this.sanitizeUrl(source)}`)
			return cached.dataUrl
		}

		try {
			let buffer: Buffer
			let contentType: string

			// Handle local file paths
			if (source.startsWith("file://")) {
				const filePath = source.replace("file://", "")
				logger.info(`Loading local file: ${this.sanitizeUrl(filePath)}`)
				buffer = await fs.readFile(filePath)
				contentType = this.getContentTypeFromFileName(filePath)
			}
			// Handle HTTP/HTTPS URLs
			else if (source.startsWith("http://") || source.startsWith("https://")) {
				logger.info(`Fetching remote image: ${this.sanitizeUrl(source)}`)
				const response = await fetch(source, {
					headers: {
						"User-Agent": "VLC-Discord-RP/3.0 (https://github.com/valeriko777/vlc-discord-rp)",
					},
				})

				if (!response.ok) {
					throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
				}

				buffer = Buffer.from(await response.arrayBuffer())
				contentType =
					response.headers.get("content-type") || this.getContentTypeFromFileName(source)
			}
			// Invalid source
			else {
				logger.warn(`Unsupported image source format: ${this.sanitizeUrl(source)}`)
				return null
			}

			// Convert to data URL
			const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`

			// Cache the result
			this.cache.set(source, {
				dataUrl,
				timestamp: Math.floor(Date.now() / 1000),
			})

			return dataUrl
		} catch (error) {
			logger.error(
				`Error converting image to data URL: ${error}, Source: ${this.sanitizeUrl(source)}`,
			)
			return null
		}
	}

	/**
	 * Clear the cache
	 */
	public clearCache(): void {
		this.cache.clear()
		logger.info("Image proxy cache cleared")
	}

	/**
	 * Determine content type from file name
	 */
	private getContentTypeFromFileName(fileName: string): string {
		const extension = fileName.toLowerCase().split(".").pop() || ""

		switch (extension) {
			case "jpg":
			case "jpeg":
				return "image/jpeg"
			case "png":
				return "image/png"
			case "gif":
				return "image/gif"
			case "webp":
				return "image/webp"
			case "bmp":
				return "image/bmp"
			default:
				return "image/jpeg" // Default to JPEG as fallback
		}
	}

	/**
	 * Sanitize URL for logging (remove sensitive parts)
	 */
	private sanitizeUrl(url: string): string {
		// For local files, only show the last part of the path
		if (url.startsWith("file://") || (!url.startsWith("http://") && !url.startsWith("https://"))) {
			const parts = url.split(/[/\\]/)
			return `.../${parts.slice(-2).join("/")}`
		}

		// For HTTP URLs, show everything
		return url
	}
}

export const imageProxyService = ImageProxyService.getInstance()
