import type { VlcMetadata, VlcStreamInfo } from "./vlc.types"

const RESOLUTION_PATTERN = /^(\d+)x(\d+)$/

/**
 * Detect whether any stream in a VLC status category is video, and its
 * resolution, without depending on VLC's localized field names.
 *
 * VLC translates keys like "Type" and "Video_resolution" to its interface
 * language, so matching on the resolution value's shape ("1280x720") instead
 * of the field name works regardless of language. Embedded cover art is
 * extracted by VLC into a separate artwork_url and never appears as a stream,
 * so this cannot mistake an audio file's cover for video.
 */
export function detectVideoStream(
	category: Record<string, VlcStreamInfo | VlcMetadata | Record<string, unknown>>,
): { isVideo: boolean; videoInfo?: { width: number; height: number } } {
	for (const [key, stream] of Object.entries(category)) {
		if (key === "meta" || !stream) {
			continue
		}

		for (const value of Object.values(stream as VlcStreamInfo)) {
			const match = typeof value === "string" ? value.match(RESOLUTION_PATTERN) : null
			if (match) {
				return {
					isVideo: true,
					videoInfo: {
						width: Number.parseInt(match[1], 10),
						height: Number.parseInt(match[2], 10),
					},
				}
			}
		}
	}

	return { isVideo: false }
}
