import { logger } from "@main/core/logger"
import type { CandidateRelease, CoverArtSource } from "./music.types"

const BASE_URL = "https://coverartarchive.org"
const REQUEST_TIMEOUT_MS = 5000

/**
 * Discord renders the cover small, and the archive charges dearly for the full
 * size one: measured on a real release, 1.4 MB against 50 KB for this thumbnail.
 */
const PREFERRED_THUMBNAIL = "500"

interface CoverArtImage {
	front: boolean
	image: string
	thumbnails: Record<string, string>
}

// The abort timer has to cover reading the body too: clearing it once the
// headers arrive leaves a stalled response unbounded.
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

	try {
		return await run(controller.signal)
	} finally {
		clearTimeout(timeoutId)
	}
}

function frontThumbnail(images: CoverArtImage[]): string | null {
	const front = images.find((image) => image.front)
	if (!front) {
		return null
	}
	return front.thumbnails[PREFERRED_THUMBNAIL] ?? front.image
}

export class CoverArtArchive implements CoverArtSource {
	public async coverFor(release: CandidateRelease): Promise<string | null> {
		if (release.id) {
			const cover = await this.lookup("release", release.id)
			if (cover) {
				return cover
			}
		}

		// Asking the group is not a second opinion about the same edition: it
		// redirects to whichever release the group considers representative, and
		// that is frequently another one. Verified, the group above the release
		// under test answered with a different release id. So it runs only once
		// the edition we actually want has turned out to have no art.
		if (release.releaseGroupId) {
			return await this.lookup("release-group", release.releaseGroupId)
		}

		return null
	}

	/**
	 * `null` when the archive answered and holds no front image for this mbid,
	 * throws when the request could not be completed at all.
	 *
	 * The resolver caches the first for a day and the second for seconds, so a
	 * 5xx must never read as "no artwork": measured, the same mbid answered 500
	 * on one attempt and 200 a minute later, and one blip would hide a cover for
	 * the rest of the day.
	 */
	private async lookup(kind: "release" | "release-group", mbid: string): Promise<string | null> {
		try {
			return await withTimeout(async (signal) => {
				// The archive answers 307 here and Node follows it to the
				// archive.org item json on its own.
				const response = await fetch(`${BASE_URL}/${kind}/${mbid}`, { signal })

				// The one status that means "asked correctly, there is nothing
				// here". Its body is html, so it is never parsed.
				if (response.status === 404) {
					return null
				}
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}

				const body = (await response.json()) as { images?: CoverArtImage[] }
				return frontThumbnail(body.images ?? [])
			})
		} catch (error) {
			logger.warn(
				`Cover Art Archive ${kind} lookup failed: ${error instanceof Error ? error.name : "unknown error"}`,
			)
			throw error
		}
	}
}
