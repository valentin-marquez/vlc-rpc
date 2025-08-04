import { logger } from "@main/services/logger"

/**
 * Service to upload images to 0x0.st temporary file hosting
 */
export class ImageUploaderService {
	private static instance: ImageUploaderService | null = null
	private readonly uploadUrl = "https://0x0.st"
	private readonly appVersion = "3.0.0"
	private readonly appName = "VLC-Discord-RPC"

	private constructor() {
		logger.info("Image uploader service initialized")
	}

	/**
	 * Get the singleton instance of the image uploader service
	 */
	public static getInstance(): ImageUploaderService {
		if (!ImageUploaderService.instance) {
			ImageUploaderService.instance = new ImageUploaderService()
		}
		return ImageUploaderService.instance
	}

	/**
	 * Upload an image file to 0x0.st
	 * @param imageBuffer - The image data as a Buffer
	 * @param filename - Original filename with extension
	 * @param expiryHours - Hours until expiration (optional, defaults to 24 hours)
	 * @returns The URL of the uploaded image or null if failed
	 */
	public async uploadImage(
		imageBuffer: Buffer,
		filename: string,
		expiryHours = 24,
	): Promise<string | null> {
		try {
			logger.info(`Uploading image to 0x0.st: ${filename} (${imageBuffer.length} bytes)`)

			const formData = new FormData()

			// Create a blob from the buffer using Uint8Array
			const uint8Array = new Uint8Array(imageBuffer)
			const blob = new Blob([uint8Array], {
				type: this.getMimeType(filename),
			})

			formData.append("file", blob, filename)
			formData.append("expires", expiryHours.toString())
			formData.append("secret", "") // Use secret for harder-to-guess URLs

			const response = await fetch(this.uploadUrl, {
				method: "POST",
				body: formData,
				headers: {
					"User-Agent": `${this.appName}/${this.appVersion}`,
				},
			})

			if (!response.ok) {
				logger.error(`Failed to upload image: HTTP ${response.status}`)
				return null
			}

			const responseText = await response.text()
			const uploadedUrl = responseText.trim()

			if (!uploadedUrl.startsWith("http")) {
				logger.error(`Invalid upload response: ${responseText}`)
				return null
			}

			logger.info(`Image uploaded successfully: ${uploadedUrl}`)
			return uploadedUrl
		} catch (error) {
			logger.error(`Error uploading image: ${error}`)
			return null
		}
	}

	/**
	 * Upload an image from a URL to 0x0.st
	 * @param imageUrl - The URL of the image to upload
	 * @param expiryHours - Hours until expiration (optional, defaults to 24 hours)
	 * @returns The URL of the uploaded image or null if failed
	 */
	public async uploadImageFromUrl(imageUrl: string, expiryHours = 24): Promise<string | null> {
		try {
			logger.info(`Uploading image from URL to 0x0.st: ${imageUrl}`)

			const formData = new FormData()
			formData.append("url", imageUrl)
			formData.append("expires", expiryHours.toString())
			formData.append("secret", "") // Use secret for harder-to-guess URLs

			const response = await fetch(this.uploadUrl, {
				method: "POST",
				body: formData,
				headers: {
					"User-Agent": `${this.appName}/${this.appVersion}`,
				},
			})

			if (!response.ok) {
				logger.error(`Failed to upload image from URL: HTTP ${response.status}`)
				return null
			}

			const responseText = await response.text()
			const uploadedUrl = responseText.trim()

			if (!uploadedUrl.startsWith("http")) {
				logger.error(`Invalid upload response: ${responseText}`)
				return null
			}

			logger.info(`Image uploaded successfully from URL: ${uploadedUrl}`)
			return uploadedUrl
		} catch (error) {
			logger.error(`Error uploading image from URL: ${error}`)
			return null
		}
	}

	/**
	 * Generate metadata tags for embedding in audio files
	 * @param imageUrl - The uploaded image URL
	 * @param expiryDate - When the image expires (optional)
	 * @returns Object with metadata tags
	 */
	public generateMetadataTags(imageUrl: string, expiryDate?: Date): Record<string, string> {
		const tags: Record<string, string> = {
			"X-COVER-URL": imageUrl,
			"X-APP-VERSION": this.appVersion,
			"X-PROCESSED-BY": this.appName,
		}

		if (expiryDate) {
			tags["X-EXPIRY-DATE"] = expiryDate.toISOString()
		}

		return tags
	}

	/**
	 * Parse metadata tags from audio file metadata
	 * @param metadata - The metadata object from VLC
	 * @returns Parsed image URL and metadata info
	 */
	public parseMetadataTags(metadata: Record<string, string | undefined>): {
		imageUrl: string | null
		isExpired: boolean
		appVersion: string | null
		processedBy: string | null
	} {
		const imageUrl = metadata["X-COVER-URL"] || null
		const appVersion = metadata["X-APP-VERSION"] || null
		const processedBy = metadata["X-PROCESSED-BY"] || null
		const expiryDateStr = metadata["X-EXPIRY-DATE"]

		let isExpired = false
		if (expiryDateStr) {
			try {
				const expiryDate = new Date(expiryDateStr)
				isExpired = expiryDate.getTime() < Date.now()
			} catch (error) {
				logger.warn(`Invalid expiry date format: ${expiryDateStr}`)
			}
		}

		return {
			imageUrl,
			isExpired,
			appVersion,
			processedBy,
		}
	}

	/**
	 * Get MIME type based on file extension
	 * @param filename - The filename with extension
	 * @returns MIME type string
	 */
	private getMimeType(filename: string): string {
		const ext = filename.toLowerCase().split(".").pop()

		switch (ext) {
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
				return "image/jpeg"
		}
	}
}

export const imageUploaderService = ImageUploaderService.getInstance()
