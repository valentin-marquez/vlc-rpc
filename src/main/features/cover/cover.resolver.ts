import { promises as fs } from "node:fs"
import { logger } from "@main/core/logger"
import { vlcStatusService } from "@main/features/vlc"
import type { VlcStatus } from "@shared/types/vlc"
import { metadataWriterService } from "./cover.store"
import { multiImageUploaderService } from "./cover.uploader"

/** Media data structure for cover art searching */
interface MediaData {
	title?: string
	artist?: string
	album?: string
	artworkUrl?: string
	date?: string
	year?: string
	[key: string]: string | undefined
}

/** Service to fetch album cover art for audio files */
export class CoverArtService {
	private static instance: CoverArtService | null = null

	private constructor() {
		logger.info("Cover art service initialized")
	}

	/** Get the singleton instance of the cover art service */
	public static getInstance(): CoverArtService {
		if (!CoverArtService.instance) {
			CoverArtService.instance = new CoverArtService()
		}
		return CoverArtService.instance
	}

	/** Fetch cover art URL using all available media information */
	public async fetch(mediaInfo: VlcStatus | null): Promise<string | null> {
		const media = this.extractMediaData(mediaInfo)
		if (!media) {
			return null
		}

		// Step 1: Check if media already has an uploaded image URL in its metadata
		const fileUri = await vlcStatusService.getCurrentFileUri()
		if (fileUri && media.artworkUrl) {
			const filePath = metadataWriterService.vlcUriToFilePath(fileUri)
			if (filePath) {
				const customMetadata = await metadataWriterService.readMetadataTags(filePath)
				if (customMetadata) {
					const parsed = multiImageUploaderService.parseMetadataTags(customMetadata)
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
					const uploadedUrl = await multiImageUploaderService.uploadImage(
						imageBuffer,
						filename,
						24 * 7,
					) // 7 days

					if (uploadedUrl && fileUri) {
						// Store the uploaded URL in metadata for future use
						const filePath = metadataWriterService.vlcUriToFilePath(fileUri)
						if (filePath) {
							const expiryDate = new Date()
							expiryDate.setDate(expiryDate.getDate() + 7) // 7 days from now

							const tags = multiImageUploaderService.generateMetadataTags(uploadedUrl, expiryDate)
							await metadataWriterService.writeMetadataTags(filePath, tags)

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
	private extractMediaData(mediaInfo: VlcStatus | null): MediaData | null {
		if (!mediaInfo || typeof mediaInfo !== "object") {
			logger.info("No valid media info provided for cover art")
			return null
		}

		return mediaInfo.media as MediaData
	}
}

export const coverArtService = CoverArtService.getInstance()
