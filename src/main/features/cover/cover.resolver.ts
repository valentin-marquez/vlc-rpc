import { promises as fs } from "node:fs"
import { logger } from "@main/core/logger"
import type { Client as VlcClient } from "@main/features/vlc"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Store as CoverStore } from "./cover.store"
import type { Uploader as CoverUploader } from "./cover.uploader"

/** Service to fetch album cover art for audio files */
export class Resolver {
	constructor(
		private readonly vlc: VlcClient,
		private readonly store: CoverStore,
		private readonly uploader: CoverUploader,
	) {
		logger.info("Cover art service initialized")
	}

	/** Fetch cover art URL using all available media information */
	public async fetch(mediaInfo: VlcStatus | null): Promise<string | null> {
		const media = this.extractMediaData(mediaInfo)
		if (!media) {
			return null
		}

		// Step 1: Check if media already has an uploaded image URL in its metadata
		const fileUri = await this.vlc.getCurrentFileUri()
		if (fileUri && media.artworkUrl) {
			const filePath = this.store.vlcUriToFilePath(fileUri)
			if (filePath) {
				const customMetadata = await this.store.readMetadataTags(filePath)
				if (customMetadata) {
					const parsed = this.uploader.parseMetadataTags(customMetadata)
					if (parsed.imageUrl && !parsed.isExpired) {
						logger.info(`Using existing uploaded cover image: ${parsed.imageUrl}`)
						return parsed.imageUrl
					}

					if (parsed.isExpired) {
						logger.info("Existing uploaded cover image has expired, will re-upload")
					}
				}
			}
		}

		// Step 2: Prioritize local artwork from the file
		if (media.artworkUrl?.startsWith("file://")) {
			try {
				// Upload the local artwork to 0x0.st for Discord compatibility
				const localPath = media.artworkUrl.replace("file://", "")
				const decodedPath = decodeURIComponent(localPath)

				// Handle Windows paths
				const fixedPath =
					process.platform === "win32" && decodedPath.startsWith("/")
						? decodedPath.substring(1)
						: decodedPath

				try {
					const imageBuffer = await fs.readFile(fixedPath)
					const filename = `cover_${Date.now()}.jpg`
					const uploadedUrl = await this.uploader.uploadImage(imageBuffer, filename, 24 * 7) // 7 days

					if (uploadedUrl && fileUri) {
						// Store the uploaded URL in metadata for future use
						const filePath = this.store.vlcUriToFilePath(fileUri)
						if (filePath) {
							const expiryDate = new Date()
							expiryDate.setDate(expiryDate.getDate() + 7) // 7 days from now

							const tags = this.uploader.generateMetadataTags(uploadedUrl, expiryDate)
							await this.store.writeMetadataTags(filePath, tags)

							logger.info(`Uploaded local artwork and saved metadata: ${uploadedUrl}`)
						}
						return uploadedUrl
					}
				} catch (error) {
					logger.warn(`Could not upload local artwork: ${error}`)
				}
			} catch (error) {
				logger.warn(`Error processing local artwork: ${error}`)
			}
		}

		// No cover art available - no more online search
		logger.info("No local artwork available and online search disabled")
		return null
	}

	/** Extract media data from the input */
	private extractMediaData(mediaInfo: VlcStatus | null): VlcStatus["media"] | null {
		if (!mediaInfo || typeof mediaInfo !== "object") {
			logger.info("No valid media info provided for cover art")
			return null
		}

		return mediaInfo.media
	}
}
