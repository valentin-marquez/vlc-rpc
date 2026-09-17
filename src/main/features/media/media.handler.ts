import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { Resolver as ArtworkResolver } from "@main/features/artwork"
import type { Resolver as CatalogResolver, CatalogResult } from "@main/features/catalog"
import type { CorrectedTags, OverrideTarget } from "@main/features/overrides"
import type { Client as VlcClient } from "@main/features/vlc"
import type { ContentMetadata, ContentType, DetectedMediaInfo } from "@shared/media/media.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"

import type { ImageProxy } from "./media.image-proxy"

/**
 * The renderer reads an absent field as unknown, so season and episode are
 * assigned only when the parse behind the catalog result actually found them.
 */
function toVideoMetadata(result: CatalogResult): ContentMetadata {
	const metadata: ContentMetadata = { clean_title: result.title }

	if (result.season !== undefined) {
		metadata.season = result.season
	}
	if (result.episode !== undefined) {
		metadata.episode = result.episode
	}

	return metadata
}

/**
 * The catalog reports a work as film or television. It stays at that grain even
 * though AniList is its only provider today: what the panel and the override
 * form need is the distinction the presence text pivots on, not the genre.
 */
function toContentType(mediaKind: CatalogResult["mediaKind"]): ContentType {
	return mediaKind === "tv" ? "tv_show" : "movie"
}

/**
 * A resolver asked where a correction for this file would be filed, which is a
 * question it can answer without resolving. Declared here so the audio side
 * arrives as the music catalog itself: `artwork` picks which cover to show, and
 * knows nothing about how a record is keyed.
 */
export interface OverrideTargets {
	overrideTargetFor(status: VlcStatus): Promise<OverrideTarget | null>
	/**
	 * What a file reads as when its own tags name nothing, and who says so.
	 * Reported so the form opens on what the user last typed rather than on the
	 * file name, which is the same reason the cover's own address is reported
	 * beside it, and so the screen can say when the words were matched from the
	 * audio instead.
	 */
	correctedTagsFor(status: VlcStatus): Promise<CorrectedTags | null>
}

/**
 * The corrected tags in the shape the renderer already reads resolved values
 * in. It is the same channel the video branch uses for a catalog title: what
 * the app is going to show, beside the raw name the file carries.
 */
function toAudioMetadata(tags: CorrectedTags): ContentMetadata {
	const metadata: ContentMetadata = {}

	if (tags.title !== undefined) {
		metadata.clean_title = tags.title
	}
	if (tags.artist !== undefined) {
		metadata.artist = tags.artist
	}

	return metadata
}

function reportOverrideTarget(info: DetectedMediaInfo, target: OverrideTarget | null): void {
	if (!target) return
	info.override_key = target.key
	info.override_active = target.active
	// What the key is bound to travels with it rather than being read back off
	// the key: the shapes are built in `main`, and a renderer that re-derived
	// them would be a second grammar to keep in step.
	info.override_binding = target.kind
}

/**
 * Handler for accessing media information
 */
export class MediaInfoHandler {
	// Cache for the last media data
	private lastMediaInfo: (VlcStatus & DetectedMediaInfo) | null = null

	constructor(
		private readonly artwork: ArtworkResolver,
		private readonly catalog: CatalogResolver,
		private readonly music: OverrideTargets,
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

				// The audio text normally comes from the file's own tags, which the
				// renderer already has, so there is nothing to report beside the kind.
				// A file with no tags is the exception: what the app shows for it is
				// what the user typed, and it has to travel like any resolved title.
				mediaInfo.content_type = "audio"
				reportOverrideTarget(mediaInfo, await this.music.overrideTargetFor(vlcStatus))

				const corrected = await this.music.correctedTagsFor(vlcStatus)
				if (corrected) {
					mediaInfo.content_name_source = corrected.source
					// A refused match names nothing, so it reports the source alone:
					// an empty metadata object would read on the screen as a title and
					// an artist the app has and is not showing.
					if (corrected.title !== undefined || corrected.artist !== undefined) {
						mediaInfo.content_metadata = toAudioMetadata(corrected)
					}
				}
			}

			if (vlcStatus.mediaType === "video") {
				const catalogResult = await this.catalog.resolve(vlcStatus)
				if (catalogResult) {
					// A work can be identified without art, so the title and the kind
					// are reported whether or not a poster came with them.
					if (catalogResult.poster) {
						mediaInfo.content_image_url = catalogResult.poster
					}
					mediaInfo.content_type = toContentType(catalogResult.mediaKind)
					mediaInfo.content_metadata = toVideoMetadata(catalogResult)
				}

				// Outside the branch above on purpose. A work the catalog identifies
				// as nothing is the case a correction is for, and since TMDB was
				// removed that is all of western film and television.
				reportOverrideTarget(mediaInfo, this.catalog.overrideTargetFor(vlcStatus))
			}

			if (mediaInfo.media?.artworkUrl) {
				const dataUrl = await this.imageProxy.getImageAsDataUrl(mediaInfo.media.artworkUrl)
				if (dataUrl) {
					mediaInfo.media.artworkUrl = dataUrl
				}
			}

			if (mediaInfo.content_image_url) {
				mediaInfo.content_image_source_url = mediaInfo.content_image_url

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
