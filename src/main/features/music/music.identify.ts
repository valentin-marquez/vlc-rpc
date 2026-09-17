import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { pickIdentified } from "./music.scorer"
import type {
	AudioFileIdentity,
	AudioFingerprinter,
	AudioIdLookup,
	AudioIdentifier,
	IdentifyOutcome,
} from "./music.types"

/** What VLC is playing, narrowed to the one question this step asks of it. */
export interface PlayingFile {
	getCurrentFileUri(): Promise<string | null>
}

/**
 * `fileURLToPath` rather than trimming the scheme by hand: it is the one place
 * that already knows drive letters, percent decoding and UNC shares. The cover
 * feature carries its own copy of this, on a store that also writes metadata,
 * and music has no business depending on that.
 */
function filePathOf(uri: string): string | null {
	// A stream has no bytes on disk, so there is nothing here to fingerprint.
	if (!uri.startsWith("file:")) {
		return null
	}

	try {
		return fileURLToPath(uri)
	} catch {
		return null
	}
}

/**
 * Identification from the audio itself: hash the file, ask AcoustID what
 * recording it is, and refuse anything the answer is not clear about.
 *
 * It runs last in the cover chain and it is the only step whose rate limit is
 * shared with every other user of the application, so everything here is built
 * to ask as little as possible: the binary is checked before any work, the
 * playlist is read once per item rather than once per poll, and a lookup never
 * happens for a file that could not be fingerprinted.
 */
export class Identifier implements AudioIdentifier {
	/**
	 * The playlist item this file was located for. The presence loop resolves
	 * every 1.5 seconds and reading the playlist is an http round trip, so the
	 * same question about the same item is asked once. The id is VLC's own and
	 * changes with the item, which no tag on an untagged file does.
	 */
	private located: { plid: number; file: AudioFileIdentity | null } | null = null

	constructor(
		private readonly playing: PlayingFile,
		private readonly fingerprinter: AudioFingerprinter,
		private readonly acoustid: AudioIdLookup,
	) {}

	public async fileFor(status: VlcStatus): Promise<AudioFileIdentity | null> {
		if (!this.fingerprinter.available) {
			return null
		}

		const plid = status.plid
		const memo = this.located
		if (plid !== null && memo !== null && memo.plid === plid) {
			return memo.file
		}

		const file = await this.locate()
		if (plid !== null) {
			this.located = { plid, file }
		}
		return file
	}

	public async identify(file: AudioFileIdentity): Promise<IdentifyOutcome> {
		const fingerprint = await this.fingerprinter.fingerprint(file.path)
		if (fingerprint.kind === "absent") {
			return { kind: "unavailable" }
		}
		if (fingerprint.kind === "failed") {
			// A file this binary cannot decode will not decode on the next poll
			// either, and the entry recording that is keyed by the file, so a
			// replaced or repaired file asks again on its own.
			return { kind: "unidentified", reason: "no-results" }
		}

		const outcome = await this.acoustid.lookup(fingerprint.fingerprint, fingerprint.duration)
		if (outcome.kind === "unavailable") {
			return { kind: "unavailable" }
		}
		if (outcome.matches.length === 0) {
			return { kind: "unidentified", reason: "no-results" }
		}

		const best = pickIdentified(outcome.matches)
		if (best === null) {
			return { kind: "unidentified", reason: "no-match" }
		}

		return {
			kind: "identified",
			recording: {
				provider: "acoustid",
				id: best.id,
				title: best.title,
				artists: best.artists,
				releases: best.releases,
				rank: best.rank,
			},
		}
	}

	private async locate(): Promise<AudioFileIdentity | null> {
		try {
			const uri = await this.playing.getCurrentFileUri()
			if (uri === null) {
				return null
			}

			const path = filePathOf(uri)
			if (path === null) {
				return null
			}

			const stats = await stat(path)
			return stats.isFile() ? { path, size: stats.size, modifiedAt: stats.mtimeMs } : null
		} catch {
			// A file that moved between the playlist read and this one. The step
			// is the last in the chain and its failures are never news.
			return null
		}
	}
}
