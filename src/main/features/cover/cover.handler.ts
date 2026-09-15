import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Store } from "./cover.store"

/**
 * Metadata handler for IPC communication
 */
export class MetadataHandler {
	constructor(private readonly store: Store) {
		this.registerHandlers()
		logger.info("Metadata handler initialized")
	}

	/**
	 * Register IPC handlers for metadata operations
	 */
	private registerHandlers(): void {
		registerHandler("metadata:clear-cache", async () => {
			try {
				const stats = this.store.getMetadataStats()

				configService.set("fileMetadata", {})

				logger.info(`Cleared metadata cache: ${stats.totalFiles} files removed`)
				return {
					success: true,
					message: `Cleared ${stats.totalFiles} metadata entries`,
					filesRemoved: stats.totalFiles,
				}
			} catch (error) {
				logger.error(`Error clearing metadata cache: ${error}`)
				return {
					success: false,
					message: `Error clearing cache: ${error}`,
					filesRemoved: 0,
				}
			}
		})

		registerHandler("metadata:get-stats", async () => {
			try {
				const stats = this.store.getMetadataStats()
				const allMetadata = this.store.getAllMetadata()

				const cacheSize = JSON.stringify(allMetadata).length
				const cacheSizeKB = Math.round(cacheSize / 1024)

				logger.info(
					`Metadata stats requested: ${stats.totalFiles} files, ${stats.expiredFiles} expired`,
				)
				return {
					success: true,
					stats: {
						...stats,
						cacheSizeKB,
						cacheSizeBytes: cacheSize,
					},
				}
			} catch (error) {
				logger.error(`Error getting metadata stats: ${error}`)
				return {
					success: false,
					stats: {
						totalFiles: 0,
						expiredFiles: 0,
						cacheSizeKB: 0,
						cacheSizeBytes: 0,
					},
				}
			}
		})

		registerHandler("metadata:cleanup-expired", async () => {
			try {
				const cleanedCount = await this.store.cleanupExpiredMetadata()

				logger.info(`Cleaned up ${cleanedCount} expired metadata entries`)
				return {
					success: true,
					message: `Cleaned up ${cleanedCount} expired entries`,
					filesRemoved: cleanedCount,
				}
			} catch (error) {
				logger.error(`Error cleaning up expired metadata: ${error}`)
				return {
					success: false,
					message: `Error cleaning up expired entries: ${error}`,
					filesRemoved: 0,
				}
			}
		})
	}
}
