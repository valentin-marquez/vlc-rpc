import { IpcChannels, IpcEvents } from "@shared/types"
import type { DetectedMediaInfo } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"
import { ipcMain } from "electron"
import { coverArtService } from "../services/cover-art"
import { imageProxyService } from "../services/image-proxy"
import { logger } from "../services/logger"
import { vlcStatusService } from "../services/vlc-status"

/**
 * Handler for accessing media information
 */
export class MediaInfoHandler {
	// Cache for the last media data
	private lastMediaInfo: (VlcStatus & DetectedMediaInfo) | null = null

	constructor() {
		this.registerIpcHandlers()
	}

	/**
	 * Register IPC handlers for media information
	 */
	private registerIpcHandlers(): void {
		ipcMain.handle(`${IpcChannels.MEDIA}:get-media-info`, async () => {
			try {
				const currentStatus = await vlcStatusService.readStatus(false)

				if (!currentStatus || !currentStatus.active) {
					return null
				}

				return await this.getMediaInfo(currentStatus)
			} catch (error) {
				logger.error(`Error getting media info: ${error}`)
				return null
			}
		})

		ipcMain.handle(`${IpcChannels.IMAGE}:${IpcEvents.IMAGE_PROXY}`, async (_, url: string) => {
			return await imageProxyService.getImageAsDataUrl(url)
		})
	}

	/**
	 * Get media information for the current media
	 */
	public async getMediaInfo(
		vlcStatus: VlcStatus | null,
	): Promise<(VlcStatus & DetectedMediaInfo) | null> {
		if (!vlcStatus) {
			return null
		}

		try {
			// Use the media info directly since VLC status service already provides reliable type detection
			const mediaInfo: VlcStatus & DetectedMediaInfo = { ...vlcStatus } as VlcStatus &
				DetectedMediaInfo

			// For audio content, try to get cover art
			if (vlcStatus.mediaType === "audio") {
				const coverUrl = await coverArtService.fetch(vlcStatus)
				if (coverUrl) {
					mediaInfo.content_image_url = coverUrl
				}
			}

			if (mediaInfo.media?.artworkUrl) {
				const dataUrl = await imageProxyService.getImageAsDataUrl(mediaInfo.media.artworkUrl)
				if (dataUrl) {
					mediaInfo.media.artworkUrl = dataUrl
				}
			}

			if (mediaInfo.content_image_url) {
				const dataUrl = await imageProxyService.getImageAsDataUrl(mediaInfo.content_image_url)
				if (dataUrl) {
					mediaInfo.content_image_url = dataUrl
				}
			}

			// Cache the media info for future use
			this.lastMediaInfo = mediaInfo

			return mediaInfo
		} catch (error) {
			logger.error(`Error processing media info: ${error}`)
			return vlcStatus as VlcStatus & DetectedMediaInfo
		}
	}

	/**
	 * Get the last media info from cache
	 */
	public getLastMediaInfo(): (VlcStatus & DetectedMediaInfo) | null {
		return this.lastMediaInfo
	}
}
