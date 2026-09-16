import { logger } from "@main/core/logger"
import type { FileMetadata } from "@shared/config/app-config"

interface UploadRequest {
	imageBuffer: Buffer
	filename: string
	expiryHours: number
	signal: AbortSignal
}

interface ImageUploadService {
	name: string
	upload: (request: UploadRequest) => Promise<string | null>
	maxFileSize: number
	supportsExpiry: boolean
}

/** The attempt that produced a url first, and the controller that must survive. */
interface RaceWinner {
	serviceName: string
	url: string
	controller: AbortController
}

function isUsableUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value.trim())
		return protocol === "http:" || protocol === "https:"
	} catch {
		return false
	}
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : "unknown"
}

/** tempfile.org honours 1, 6, 24 or 48 hours only, so ask for the longest that fits. */
function tempFileExpiry(expiryHours: number): number {
	return [1, 6, 24, 48].filter((hours) => hours <= expiryHours).at(-1) ?? 1
}

export class Uploader {
	private readonly appVersion = "4.0.2"
	private readonly appName = "VLC-Discord-RPC"

	// One honest identifier for every host, replacing the rotation this class used
	// to do. Rotating fake clients reads as human only across spaced out requests.
	// The five now leave together from one address, where five different clients
	// in the same instant is a stranger pattern than one client that says who it is.
	private readonly userAgent = `${this.appName}/${this.appVersion}`

	private readonly services: ImageUploadService[] = [
		{
			name: "x0.at",
			upload: this.uploadToX0At.bind(this),
			maxFileSize: 512 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "catbox.moe",
			upload: this.uploadToCatbox.bind(this),
			maxFileSize: 200 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "uguu.se",
			upload: this.uploadToUguu.bind(this),
			maxFileSize: 128 * 1024 * 1024,
			supportsExpiry: false,
		},
		{
			name: "0x0.st",
			upload: this.uploadTo0x0st.bind(this),
			maxFileSize: 512 * 1024 * 1024,
			supportsExpiry: true,
		},
		// tmpfiles.org was removed, not left to lose honestly like 0x0.st sometimes
		// does. Its upload answers with a url that looks fine but no longer serves
		// the file, the /dl/ path redirects to an html page instead of the image,
		// so it would win the race and hand Discord a link that renders nothing.
		{
			name: "tempfile.org",
			upload: this.uploadToTempFile.bind(this),
			maxFileSize: 100 * 1024 * 1024,
			supportsExpiry: true,
		},
	]

	constructor() {
		logger.info("Multi-service image uploader initialized")
	}

	public async uploadImage(
		imageBuffer: Buffer,
		filename: string,
		expiryHours = 24,
	): Promise<string | null> {
		const fileSize = imageBuffer.length

		for (const service of this.services) {
			if (fileSize > service.maxFileSize) {
				logger.warn(
					`Skipping ${service.name}: file too large (${fileSize} > ${service.maxFileSize})`,
				)
			}
		}

		const entrants = this.services.filter((service) => fileSize <= service.maxFileSize)
		logger.info(`Racing ${entrants.length} upload services: ${filename} (${fileSize} bytes)`)

		const attempts = entrants.map((service) => {
			const controller = new AbortController()
			return {
				controller,
				result: this.attempt(service, controller, { imageBuffer, filename, expiryHours }),
			}
		})

		let winner: RaceWinner
		try {
			winner = await Promise.any(attempts.map((attempt) => attempt.result))
		} catch {
			logger.error("All upload services failed")
			return null
		}

		// Every entrant is uploading the same bytes, so the moment one of them has a
		// url the rest are spending the user's bandwidth on an answer nobody reads.
		for (const attempt of attempts) {
			if (attempt.controller !== winner.controller) {
				attempt.controller.abort()
			}
		}

		logger.info(`Upload won by ${winner.serviceName}: ${winner.url}`)
		return winner.url
	}

	private async attempt(
		service: ImageUploadService,
		controller: AbortController,
		request: Omit<UploadRequest, "signal">,
	): Promise<RaceWinner> {
		try {
			const url = await service.upload({ ...request, signal: controller.signal })

			if (url && isUsableUrl(url)) {
				return { serviceName: service.name, url, controller }
			}

			logger.warn(`Upload to ${service.name} answered without a usable url`)
		} catch (error) {
			// Losing the race is how all but one upload ends, and the abort that ends
			// them is the expected outcome, not a failure worth a line in the log.
			if (!controller.signal.aborted) {
				logger.warn(`Upload to ${service.name} failed: ${errorName(error)}`)
			}
		}

		// Promise.any settles on the first fulfilled promise, so an attempt without a
		// url has to reject for the race to move on to the services still in flight.
		throw new Error(`${service.name} produced no url`)
	}

	private toBlob(imageBuffer: Buffer, filename: string): Blob {
		return new Blob([new Uint8Array(imageBuffer)], { type: this.getMimeType(filename) })
	}

	private async uploadToX0At({
		imageBuffer,
		filename,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()
		formData.append("file", this.toBlob(imageBuffer, filename), filename)

		const response = await fetch("https://x0.at/", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToCatbox({
		imageBuffer,
		filename,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("reqtype", "fileupload")
		formData.append("fileToUpload", this.toBlob(imageBuffer, filename), filename)

		const response = await fetch("https://catbox.moe/user/api.php", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToUguu({
		imageBuffer,
		filename,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()
		formData.append("files[]", this.toBlob(imageBuffer, filename), filename)

		const response = await fetch("https://uguu.se/upload", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const result = await response.json()

		if (result.success && result.files && result.files.length > 0) {
			return result.files[0].url
		}

		return null
	}

	private async uploadTo0x0st({
		imageBuffer,
		filename,
		expiryHours,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("file", this.toBlob(imageBuffer, filename), filename)
		formData.append("expires", expiryHours.toString())
		formData.append("secret", "")

		const response = await fetch("https://0x0.st", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const result = await response.text()
		return result.trim().startsWith("http") ? result.trim() : null
	}

	private async uploadToTempFile({
		imageBuffer,
		filename,
		expiryHours,
		signal,
	}: UploadRequest): Promise<string | null> {
		const formData = new FormData()

		formData.append("files", this.toBlob(imageBuffer, filename), filename)
		formData.append("expiryHours", tempFileExpiry(expiryHours).toString())

		const response = await fetch("https://tempfile.org/api/upload/local", {
			method: "POST",
			body: formData,
			headers: {
				"User-Agent": this.userAgent,
			},
			signal,
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const result = await response.json()
		const url = result.success && result.files?.[0]?.url

		if (typeof url !== "string") {
			return null
		}

		// The url tempfile.org reports is an html landing page. Discord needs the
		// bytes, which it serves one path segment deeper.
		return `${url.replace(/\/+$/, "")}/download`
	}

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

	public generateMetadataTags(imageUrl: string, expiryDate?: Date): Partial<FileMetadata> {
		const tags: Partial<FileMetadata> = {
			"X-COVER-URL": imageUrl,
			"X-APP-VERSION": this.appVersion,
			"X-PROCESSED-BY": this.appName,
		}

		if (expiryDate) {
			tags["X-EXPIRY-DATE"] = expiryDate.toISOString()
		}

		return tags
	}

	public parseMetadataTags(metadata: Partial<FileMetadata>): {
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
}
