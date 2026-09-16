import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type { Resolver as CatalogResolver } from "@main/features/catalog"
import type { Client as VlcClient } from "@main/features/vlc"
import type { DetectedMediaInfo } from "@shared/media/media.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import type { ImageProxy } from "./media.image-proxy"

/**
 * Handler for accessing media information
 */
export class MediaInfoHandler {
	// Cache for the last media data
	private lastMediaInfo: (VlcStatus & DetectedMediaInfo) | null = null

	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly vlc: VlcClient,
		private readonly imageProxy: ImageProxy,
	) {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("media:get-info", async () => {
			try {
				const currentStatus = await this.vlc.readStatus(false)

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
			return await this.imageProxy.getImageAsDataUrl(url)
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
			const mediaInfo: VlcStatus & DetectedMediaInfo = { ...vlcStatus }

			// For audio content, try to get cover art
			if (vlcStatus.mediaType === "audio") {
				const cover = await this.artwork.resolve(vlcStatus)
				if (cover) {
					mediaInfo.content_image_url = cover
				}
			}

			if (vlcStatus.mediaType === "video") {
				const catalogResult = await this.catalog.resolve(vlcStatus)
				if (catalogResult?.poster) {
					mediaInfo.content_image_url = catalogResult.poster
				}
			}

			if (mediaInfo.media?.artworkUrl) {
				const dataUrl = await this.imageProxy.getImageAsDataUrl(mediaInfo.media.artworkUrl)
				if (dataUrl) {
					mediaInfo.media.artworkUrl = dataUrl
				}
			}

			if (mediaInfo.content_image_url) {
				const dataUrl = await this.imageProxy.getImageAsDataUrl(mediaInfo.content_image_url)
				if (dataUrl) {
					mediaInfo.content_image_url = dataUrl
				}
			}

			// Cache the media info for future use
			this.lastMediaInfo = mediaInfo

			return mediaInfo
		} catch (error) {
			logger.error(`Error processing media info: ${error}`)
			return vlcStatus
		}
	}

	/**
	 * Get the last media info from cache
	 */
	public getLastMediaInfo(): (VlcStatus & DetectedMediaInfo) | null {
		return this.lastMediaInfo
	}
}
