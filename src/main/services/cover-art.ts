import { promises as fs } from "node:fs"
import { multiImageUploaderService } from "@main/services/multi-image-uploader"
import { metadataWriterService } from "@main/services/metadata-writer"
import { VideoAnalyzerService } from "@main/services/video-analyzer"
import { vlcStatusService } from "@main/services/vlc-status"
import type { VlcStatus } from "@shared/types/vlc"
import * as cheerio from "cheerio"
import { logger } from "./logger"

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
					const uploadedUrl = await multiImageUploaderService.uploadImage(imageBuffer, filename, 24 * 7) // 7 days

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

	/**
	 * Fetch cover art for video content using Google Images
	 * Only works for videos, not audio
	 */
	public async fetchVideoImageFromGoogle(mediaInfo: VlcStatus | null): Promise<string | null> {
		if (!mediaInfo || mediaInfo.mediaType !== "video") {
			return null
		}

		try {
			const videoAnalyzer = VideoAnalyzerService.getInstance()
			const videoAnalysis = videoAnalyzer.analyzeVideo(mediaInfo)

			let searchTerm = ""

			if (videoAnalysis.isTvShow) {
				// For TV shows, search for the show poster
				searchTerm = `${videoAnalysis.title} tv show poster`
			} else if (videoAnalysis.isMovie) {
				// For movies, include year if available
				if (videoAnalysis.year) {
					searchTerm = `${videoAnalysis.title} ${videoAnalysis.year} movie poster`
				} else {
					searchTerm = `${videoAnalysis.title} movie poster`
				}
			} else {
				// Generic video search
				searchTerm = `${videoAnalysis.title} cover`
			}

			logger.info(`Searching for video cover: ${searchTerm}`)
			return await this.fetchImageFromGoogle(searchTerm)
		} catch (error) {
			logger.error(`Error fetching video cover art: ${error}`)
			return null
		}
	}

	/**
	 * Fetch image from Google Images based on search term
	 */
	private async fetchImageFromGoogle(searchTerm: string): Promise<string | null> {
		try {
			logger.info(`Searching for image: ${searchTerm}`)
			const encodedQuery = encodeURIComponent(searchTerm)
			const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch`

			const response = await fetch(searchUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
					Accept: "text/html,application/xhtml+xml",
				},
			})

			if (!response.ok) {
				logger.warn(`Google search failed with status: ${response.status}`)
				return null
			}

			const html = await response.text()
			const $ = cheerio.load(html)

			let imageUrl: string | null = null

			// First, try to find gstatic images (Google's cached images)
			$("img").each((_, img) => {
				const src = $(img).attr("src")
				if (src?.startsWith("http") && !src.endsWith(".gif")) {
					if (src.includes("gstatic.com")) {
						imageUrl = src
						return false // Break the loop
					}
				}
				return true
			})

			if (imageUrl) {
				logger.info(`Found gstatic image: ${imageUrl}`)
				return imageUrl
			}

			// If no gstatic image found, try to extract from JavaScript
			const imgRegex = /https?:\/\/\S+?\.(?:jpg|jpeg|png)/g
			$("script").each((_, script) => {
				const content = $(script).html()
				if (content?.includes("AF_initDataCallback")) {
					const matches = content.match(imgRegex)
					if (matches) {
						for (const url of matches) {
							// Skip common non-content images
							if (!/icon|emoji|favicon|logo|button/i.test(url)) {
								imageUrl = url
								logger.info(`Found image from script: ${imageUrl}`)
								return false // Break the loop
							}
						}
					}
				}
				return true
			})

			if (imageUrl) {
				return imageUrl
			}

			logger.warn(`No suitable image found for: ${searchTerm}`)
			return null
		} catch (error) {
			logger.error(`Error fetching image from Google: ${error}`)
			return null
		}
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
