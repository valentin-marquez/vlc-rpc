import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { VlcStatus } from "@shared/vlc/vlc.types"

/** The artwork the file itself carries, published so Discord can display it. */
export interface FileCover {
	fetch(status: VlcStatus | null): Promise<CoverOutcome>
}

/** An external catalog, which knows nothing about the file on disk. */
export interface MusicCatalog {
	resolve(status: VlcStatus): Promise<MusicResult | null>
}

/**
 * Picks the image to show for an audio track: the file's own artwork when it is
 * up, an external catalog when the file has none.
 *
 * It sits above both features so `cover` never learns that catalogs exist, and
 * so the rule below lives in one place instead of at each of its three call
 * sites.
 */
export class Resolver {
	constructor(
		private readonly cover: FileCover,
		private readonly music: MusicCatalog,
	) {}

	public async resolve(status: VlcStatus): Promise<string | null> {
		const outcome = await this.cover.fetch(status)

		switch (outcome.kind) {
			case "published":
				return outcome.url

			case "publish-failed":
				// The file does carry artwork, it just could not be uploaded this
				// time, and its own artwork beats anything a catalog could supply.
				// The right answer is to retry the upload on a later poll, which the
				// cover resolver already arranges by not caching this outcome.
				return null

			case "no-artwork": {
				const result = await this.music.resolve(status)
				return result?.cover ?? null
			}
		}
	}
}
