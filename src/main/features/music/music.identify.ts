import type { VlcStatus } from "@shared/vlc/vlc.types"
import { pickIdentified } from "./music.scorer"
import type {
	AudioFileIdentity,
	AudioFingerprinter,
	AudioIdLookup,
	AudioIdentifier,
	FileLocator,
	IdentifyOutcome,
} from "./music.types"

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
	constructor(
		private readonly locator: FileLocator,
		private readonly fingerprinter: AudioFingerprinter,
		private readonly acoustid: AudioIdLookup,
	) {}

	public async fileFor(status: VlcStatus): Promise<AudioFileIdentity | null> {
		// Asked before the locator, which costs an http round trip: with no binary
		// there is nothing this step could do with the path it would return.
		if (!this.fingerprinter.available) {
			return null
		}

		return await this.locator.fileFor(status)
	}

	public async identify(file: AudioFileIdentity): Promise<IdentifyOutcome> {
		// The cheap question first. Hashing the audio spawns a child process that
		// reads the whole file, and the presence loop asks again every 1.5 seconds,
		// so doing it while the lookup is holding off would burn that work ten
		// times a minute for an answer that cannot arrive.
		if (!this.acoustid.available) {
			return { kind: "unavailable" }
		}

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
}
