import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { VlcStatus } from "@shared/vlc/vlc.types"

/** The artwork the file itself carries, published so Discord can display it. */
export interface FileCover {
	fetch(status: VlcStatus | null): Promise<CoverOutcome>
}

/** The music feature, which owns both the corrections and the catalogs. */
export interface MusicCatalog {
	resolve(status: VlcStatus): Promise<MusicResult | null>
	/**
	 * The cover the user typed for this file, or `null`. A narrow question on
	 * purpose: how a record is keyed stays inside `music`. Anything the tags name
	 * answers from a local read, and audio that names nothing has to go and find
	 * out which file it is, which `music` does once per playlist item.
	 */
	overrideCoverFor(status: VlcStatus): Promise<string | null>
}

/**
 * Picks the image to show for an audio track: the correction the user typed,
 * then the file's own artwork, then an external catalog. It sits above both
 * features so `cover` never learns that catalogs exist.
 */
export class Resolver {
	constructor(
		private readonly cover: FileCover,
		private readonly music: MusicCatalog,
	) {}

	public async resolve(status: VlcStatus): Promise<string | null> {
		// First, and without reading the file: the user already said what this
		// record looks like, so the embedded artwork has nothing left to win and
		// uploading it would be work done to be discarded.
		const corrected = await this.music.overrideCoverFor(status)
		if (corrected !== null) {
			return corrected
		}

		const outcome = await this.cover.fetch(status)

		switch (outcome.kind) {
			case "published":
				return outcome.url

			case "publish-failed":
				// The file does carry artwork, it just could not be uploaded this
				// time. Only a correction outranks it, and that was asked for above and
				// is not there, so a catalog guess does not get to stand in. The right
				// answer is to retry the upload on a later poll, which the cover
				// resolver already arranges by not caching this outcome.
				return null

			case "no-artwork": {
				const result = await this.music.resolve(status)
				return result?.cover ?? null
			}
		}
	}
}
