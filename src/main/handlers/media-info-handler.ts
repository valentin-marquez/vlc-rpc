import { IpcChannels, IpcEvents } from "@shared/types"
import type { EnhancedMediaInfo } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import { ipcMain } from "electron"
import { coverArtService } from "../services/cover-art"
import { imageProxyService } from "../services/image-proxy"
import { logger } from "../services/logger"
import { videoDetectorService } from "../services/video-detector"
import { vlcStatusService } from "../services/vlc-status"

/**
 * Handler for accessing enhanced media information
 */
export class MediaInfoHandler {
	// Cache for the last enhanced media data
	private lastEnhancedMediaInfo: (VlcStatus & EnhancedMediaInfo) | null = null

	constructor() {
		this.registerIpcHandlers()
	}

	/**
	 * Register IPC handlers for media information
	 */
	private registerIpcHandlers(): void {
		// Get enhanced media information
		ipcMain.handle(`${IpcChannels.MEDIA}:get-enhanced-info`, async () => {
			try {
				// First, get the current VLC status
				const currentStatus = await vlcStatusService.readStatus(false)

				if (!currentStatus || !currentStatus.active) {
					return null
				}

				// Then enhance it with media information
				return await this.getEnhancedMediaInfo(currentStatus)
			} catch (error) {
				logger.error(`Error getting enhanced media info: ${error}`)
				return null
			}
		})

		// Handle image proxying
		ipcMain.handle(`${IpcChannels.IMAGE}:${IpcEvents.IMAGE_PROXY}`, async (_, url: string) => {
			return await imageProxyService.getImageAsDataUrl(url)
		})
	}

	/**
	 * Get enhanced media information for the current media
	 */
	public async getEnhancedMediaInfo(
		vlcStatus: VlcStatus | null,
	): Promise<(VlcStatus & EnhancedMediaInfo) | null> {
		if (!vlcStatus) {
			return null
		}

		try {
			let enhancedInfo: VlcStatus & EnhancedMediaInfo

			// For video content, use the video detector service
			if (vlcStatus.mediaType === "video") {
				enhancedInfo = await videoDetectorService.analyze(vlcStatus)
			} else {
				// For audio content, start with the basic info
				enhancedInfo = { ...vlcStatus } as VlcStatus & EnhancedMediaInfo

				// Try to fetch cover art
				const coverUrl = await coverArtService.fetch(vlcStatus)
				if (coverUrl) {
					enhancedInfo.content_image_url = coverUrl
				}
			}

			// Convert artwork URL to data URL if it exists
			if (enhancedInfo.media?.artworkUrl) {
				const dataUrl = await imageProxyService.getImageAsDataUrl(enhancedInfo.media.artworkUrl)
				if (dataUrl) {
					enhancedInfo.media.artworkUrl = dataUrl
				}
			}

			// Convert content image URL to data URL if it exists
			if (enhancedInfo.content_image_url) {
				const dataUrl = await imageProxyService.getImageAsDataUrl(enhancedInfo.content_image_url)
				if (dataUrl) {
					enhancedInfo.content_image_url = dataUrl
				}
			}

			// Cache the enhanced info for future use
			this.lastEnhancedMediaInfo = enhancedInfo

			return enhancedInfo
		} catch (error) {
			logger.error(`Error enhancing media info: ${error}`)
			return vlcStatus as VlcStatus & EnhancedMediaInfo
		}
	}

	/**
	 * Get the last enhanced media info from cache
	 */
	public getLastEnhancedMediaInfo(): (VlcStatus & EnhancedMediaInfo) | null {
		return this.lastEnhancedMediaInfo
	}
}
