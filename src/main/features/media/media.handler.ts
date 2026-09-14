import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { coverArtService } from "@main/features/cover/cover.resolver"
import { imageProxyService } from "@main/features/media/media.image-proxy"
import { vlcStatusService } from "@main/features/vlc/vlc.client"
import type { DetectedMediaInfo } from "@shared/types/media"
import type { VlcStatus } from "@shared/types/vlc"

/**
 * Handler for accessing media information
 */
export class MediaInfoHandler {
	// Cache for the last media data
	private lastMediaInfo: (VlcStatus & DetectedMediaInfo) | null = null

	constructor() {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("media:get-info", async () => {
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

		registerHandler("image:proxy", async (url) => {
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
