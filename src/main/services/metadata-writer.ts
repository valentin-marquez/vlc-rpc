import { promises as fs } from "node:fs"
import { configService } from "@main/services/config"
import { logger } from "@main/services/logger"
import type { FileMetadata } from "@shared/types"

/**
 * Service to manage metadata for media files using electron-conf
 * This service handles storing and retrieving metadata centrally without creating individual JSON files
 */
export class MetadataWriterService {
	private static instance: MetadataWriterService | null = null

	private constructor() {
		logger.info("Metadata writer service initialized")
	}

	/**
	 * Get the singleton instance of the metadata writer service
	 */
	public static getInstance(): MetadataWriterService {
		if (!MetadataWriterService.instance) {
			MetadataWriterService.instance = new MetadataWriterService()
		}
		return MetadataWriterService.instance
	}

	/**
	 * Convert VLC URI to local file path
	 * @param uri - VLC URI (e.g., "file:///C:/path/to/file.mp3")
	 * @returns Local file path or null if conversion fails
	 */
	public vlcUriToFilePath(uri: string): string | null {
		try {
			if (!uri.startsWith("file://")) {
				return null
			}

			// Remove file:// prefix and decode URI components
			let filePath = decodeURIComponent(uri.replace("file://", ""))

			// Handle Windows paths (remove leading slash if present)
			if (process.platform === "win32" && filePath.startsWith("/")) {
				filePath = filePath.substring(1)
			}

			// Replace forward slashes with backslashes on Windows
			if (process.platform === "win32") {
				filePath = filePath.replace(/\//g, "\\")
			}

			return filePath
		} catch (error) {
			logger.error(`Error converting VLC URI to file path: ${error}`)
			return null
		}
	}

	/**
	 * Write custom metadata tags for a media file
	 * Now stores metadata centrally in electron-conf instead of individual JSON files
	 *
	 * @param filePath - Path to the audio file
	 * @param tags - Metadata tags to write
	 * @returns True if successful, false otherwise
	 */
	public async writeMetadataTags(filePath: string, tags: Record<string, string>): Promise<boolean> {
		try {
			logger.info(`Storing metadata for: ${filePath}`)

			// Check if file exists
			try {
				await fs.access(filePath)
			} catch (error) {
				logger.error(`File not found: ${filePath}`)
				return false
			}

			// Normalize file path for consistent storage
			const normalizedPath = this.normalizeFilePath(filePath)

			// Get current fileMetadata from config
			const currentFileMetadata =
				configService.get<Record<string, FileMetadata>>("fileMetadata") || {}

			// Get existing metadata for this file if it exists
			const existingMetadata = currentFileMetadata[normalizedPath] || {}

			// Create new metadata object
			const updatedMetadata: FileMetadata = {
				"X-COVER-URL": tags["X-COVER-URL"] || existingMetadata["X-COVER-URL"] || "",
				"X-APP-VERSION": tags["X-APP-VERSION"] || existingMetadata["X-APP-VERSION"] || "",
				"X-PROCESSED-BY": tags["X-PROCESSED-BY"] || existingMetadata["X-PROCESSED-BY"] || "",
				"X-EXPIRY-DATE": tags["X-EXPIRY-DATE"] || existingMetadata["X-EXPIRY-DATE"] || "",
			}

			// Update the file metadata in config
			currentFileMetadata[normalizedPath] = updatedMetadata
			configService.set("fileMetadata", currentFileMetadata)

			logger.info(`Metadata stored successfully for: ${normalizedPath}`)
			logger.info(`Tags stored: ${JSON.stringify(updatedMetadata)}`)
			return true
		} catch (error) {
			logger.error(`Error storing metadata: ${error}`)
			return false
		}
	}

	/**
	 * Read custom metadata tags for a media file
	 * @param filePath - Path to the audio file
	 * @returns Metadata tags object or null if not found
	 */
	public async readMetadataTags(filePath: string): Promise<Record<string, string> | null> {
		try {
			// Normalize file path for consistent retrieval
			const normalizedPath = this.normalizeFilePath(filePath)

			// Get fileMetadata from config
			const fileMetadata = configService.get<Record<string, FileMetadata>>("fileMetadata") || {}

			// Get metadata for this specific file
			const metadata = fileMetadata[normalizedPath]

			if (metadata) {
				logger.info(`Read metadata for: ${normalizedPath}`)
				return metadata as unknown as Record<string, string>
			}

			logger.info(`No metadata found for: ${normalizedPath}`)
			return null
		} catch (error) {
			logger.error(`Error reading metadata: ${error}`)
			return null
		}
	}

	/**
	 * Remove custom metadata for a media file
	 * @param filePath - Path to the audio file
	 * @returns True if successful, false otherwise
	 */
	public async removeMetadataTags(filePath: string): Promise<boolean> {
		try {
			// Normalize file path for consistent removal
			const normalizedPath = this.normalizeFilePath(filePath)

			// Get current fileMetadata from config
			const currentFileMetadata =
				configService.get<Record<string, FileMetadata>>("fileMetadata") || {}

			// Remove metadata for this file
			delete currentFileMetadata[normalizedPath]

			// Update config
			configService.set("fileMetadata", currentFileMetadata)

			logger.info(`Removed metadata for: ${normalizedPath}`)
			return true
		} catch (error) {
			logger.error(`Error removing metadata: ${error}`)
			return false
		}
	}

	/**
	 * Check if metadata exists for a file
	 * @param filePath - Path to the audio file
	 * @returns True if metadata exists, false otherwise
	 */
	public async hasMetadataTags(filePath: string): Promise<boolean> {
		try {
			// Normalize file path for consistent checking
			const normalizedPath = this.normalizeFilePath(filePath)

			// Get fileMetadata from config
			const fileMetadata = configService.get<Record<string, FileMetadata>>("fileMetadata") || {}

			return normalizedPath in fileMetadata
		} catch (error) {
			logger.error(`Error checking metadata existence: ${error}`)
			return false
		}
	}

	/**
	 * Normalize file path for consistent storage across platforms
	 * @param filePath - Original file path
	 * @returns Normalized file path
	 */
	private normalizeFilePath(filePath: string): string {
		// Convert to forward slashes for consistent storage
		let normalized = filePath.replace(/\\/g, "/")

		// Make sure it's lowercase for case-insensitive matching
		normalized = normalized.toLowerCase()

		return normalized
	}

	/**
	 * Clean up expired metadata entries
	 * This method can be called periodically to remove old metadata
	 * @returns Number of entries cleaned up
	 */
	public async cleanupExpiredMetadata(): Promise<number> {
		try {
			const currentFileMetadata =
				configService.get<Record<string, FileMetadata>>("fileMetadata") || {}
			const now = new Date()
			let cleanedCount = 0

			for (const [filePath, metadata] of Object.entries(currentFileMetadata)) {
				try {
					const expiryDate = new Date(metadata["X-EXPIRY-DATE"])
					if (expiryDate < now) {
						delete currentFileMetadata[filePath]
						cleanedCount++
						logger.info(`Cleaned up expired metadata for: ${filePath}`)
					}
				} catch (error) {
					// Invalid expiry date, remove it
					delete currentFileMetadata[filePath]
					cleanedCount++
					logger.warn(`Removed metadata with invalid expiry date for: ${filePath}`)
				}
			}

			if (cleanedCount > 0) {
				configService.set("fileMetadata", currentFileMetadata)
				logger.info(`Cleaned up ${cleanedCount} expired metadata entries`)
			}

			return cleanedCount
		} catch (error) {
			logger.error(`Error cleaning up expired metadata: ${error}`)
			return 0
		}
	}

	/**
	 * Get all stored metadata (for debugging purposes)
	 * @returns All stored metadata
	 */
	public getAllMetadata(): Record<string, FileMetadata> {
		return configService.get<Record<string, FileMetadata>>("fileMetadata") || {}
	}

	/**
	 * Get metadata statistics
	 * @returns Statistics about stored metadata
	 */
	public getMetadataStats(): { totalFiles: number; expiredFiles: number } {
		const fileMetadata = configService.get<Record<string, FileMetadata>>("fileMetadata") || {}
		const now = new Date()
		let expiredCount = 0

		for (const metadata of Object.values(fileMetadata)) {
			try {
				const expiryDate = new Date(metadata["X-EXPIRY-DATE"])
				if (expiryDate < now) {
					expiredCount++
				}
			} catch {
				expiredCount++
			}
		}

		return {
			totalFiles: Object.keys(fileMetadata).length,
			expiredFiles: expiredCount,
		}
	}

	/**
	 * Migrate metadata from old JSON files to electron-conf
	 * This method searches for .vlc-metadata.json files and imports them to the central storage
	 * @param searchPaths - Array of directories to search for JSON files
	 * @returns Number of files migrated
	 */
	public async migrateJsonMetadata(searchPaths: string[] = []): Promise<number> {
		let migratedCount = 0

		for (const searchPath of searchPaths) {
			try {
				const files = await fs.readdir(searchPath, { withFileTypes: true })

				for (const file of files) {
					if (file.isFile() && file.name.endsWith(".vlc-metadata.json")) {
						try {
							const metadataFilePath = `${searchPath}/${file.name}`
							const originalFilePath = metadataFilePath.replace(".vlc-metadata.json", "")

							// Read the JSON metadata
							const jsonData = await fs.readFile(metadataFilePath, "utf-8")
							const metadata = JSON.parse(jsonData)

							// Migrate to electron-conf
							const success = await this.writeMetadataTags(originalFilePath, metadata)

							if (success) {
								// Remove the old JSON file
								await fs.unlink(metadataFilePath)
								migratedCount++
								logger.info(`Migrated and removed: ${metadataFilePath}`)
							}
						} catch (error) {
							logger.warn(`Failed to migrate ${file.name}: ${error}`)
						}
					}
				}
			} catch (error) {
				logger.warn(`Error searching directory ${searchPath}: ${error}`)
			}
		}

		if (migratedCount > 0) {
			logger.info(
				`Successfully migrated ${migratedCount} metadata files from JSON to electron-conf`,
			)
		}

		return migratedCount
	}

	/**
	 * Clean up any remaining .vlc-metadata.json files in specified directories
	 * @param searchPaths - Array of directories to clean
	 * @returns Number of files cleaned up
	 */
	public async cleanupJsonFiles(searchPaths: string[] = []): Promise<number> {
		let cleanedCount = 0

		for (const searchPath of searchPaths) {
			try {
				const files = await fs.readdir(searchPath, { withFileTypes: true })

				for (const file of files) {
					if (file.isFile() && file.name.endsWith(".vlc-metadata.json")) {
						try {
							const filePath = `${searchPath}/${file.name}`
							await fs.unlink(filePath)
							cleanedCount++
							logger.info(`Cleaned up old JSON file: ${filePath}`)
						} catch (error) {
							logger.warn(`Failed to cleanup ${file.name}: ${error}`)
						}
					}
				}
			} catch (error) {
				logger.warn(`Error cleaning directory ${searchPath}: ${error}`)
			}
		}

		return cleanedCount
	}
}

export const metadataWriterService = MetadataWriterService.getInstance()
