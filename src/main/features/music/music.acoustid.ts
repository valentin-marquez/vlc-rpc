import { logger } from "@main/core/logger"
import type {
	AudioIdLookup,
	CandidateRelease,
	FingerprintMatch,
	LookupOutcome,
} from "./music.types"

const ENDPOINT = "https://api.acoustid.org/v2/lookup"
const REQUEST_TIMEOUT_MS = 8000

/**
 * The published limit is three requests a second for the whole application,
 * every user of it included, which makes this the one budget in the cover chain
 * that another person's track is also spending. One a second from one machine
 * leaves the rest of it for everyone else.
 */
const MIN_INTERVAL_MS = 1000

/**
 * A failed request means the service is down or already refusing the
 * application's traffic. Asking again on the next poll would spend that shared
 * budget on requests that are failing anyway.
 */
const COOLDOWN_MS = 60_000

/** Missing parameter and invalid api key: the install is wrong, not the audio. */
const CONFIGURATION_ERRORS = new Set([2, 4])

/** The fingerprint itself was not accepted, which no retry changes. */
const INVALID_FINGERPRINT = 3

interface AcoustIdArtist {
	name?: string
}

interface AcoustIdReleaseGroup {
	id?: string
	title?: string
	type?: string
	secondarytypes?: string[]
}

interface AcoustIdRecording {
	id?: string
	title?: string
	artists?: AcoustIdArtist[]
	releasegroups?: AcoustIdReleaseGroup[]
}

interface AcoustIdResult {
	score?: number
	recordings?: AcoustIdRecording[]
}

interface AcoustIdResponse {
	status?: string
	results?: AcoustIdResult[]
	error?: { code?: number }
}

/**
 * Which release group should supply the cover for a recording that belongs to
 * several. The service returns them in an order of its own: on the validated
 * file two compilations come before the studio album, and taking the first
 * would put a greatest hits cover on a correct identification.
 */
function releaseGroupRank(group: AcoustIdReleaseGroup): number {
	if (group.type === "Compilation" || (group.secondarytypes ?? []).includes("Compilation")) {
		return 4
	}
	if (group.type === "Album") return 0
	if (group.type === "EP") return 1
	if (group.type === "Single") return 2
	return 3
}

function toRelease(group: AcoustIdReleaseGroup): CandidateRelease {
	// A release group, never a release: the archive is asked by group mbid, and
	// the service does not say which edition this audio came from.
	return { title: group.title ?? "", releaseGroupId: group.id }
}

function releasesOf(recording: AcoustIdRecording): CandidateRelease[] {
	return (recording.releasegroups ?? [])
		.filter((group) => typeof group.id === "string" && group.id.length > 0)
		.sort((a, b) => releaseGroupRank(a) - releaseGroupRank(b))
		.map(toRelease)
}

/**
 * One match per recording, carrying its result's score. A result is a cluster
 * of audio, and the recordings under it are the names MusicBrainz has for that
 * cluster, so the score belongs to all of them equally.
 */
function normalize(results: AcoustIdResult[]): FingerprintMatch[] {
	const matches: FingerprintMatch[] = []

	for (const result of results) {
		const score = result.score
		if (typeof score !== "number") continue

		// A result can arrive with no recordings at all, which names nothing and
		// can never produce a cover.
		for (const recording of result.recordings ?? []) {
			if (typeof recording.id !== "string" || recording.id.length === 0) continue

			matches.push({
				score,
				id: recording.id,
				title: recording.title ?? "",
				artists: (recording.artists ?? [])
					.map((artist) => artist.name ?? "")
					.filter((name) => name.length > 0),
				releases: releasesOf(recording),
				rank: matches.length,
			})
		}
	}

	return matches
}

/**
 * AcoustID, which turns a fingerprint into MusicBrainz recordings. The key is
 * held here and never leaves this object: it is not logged, not put in a url,
 * and not part of any error this class lets out.
 */
export class AcoustId implements AudioIdLookup {
	private queue: Promise<void> = Promise.resolve()
	private lastRequestAt = 0
	private cooldownUntil = 0
	private rejected = false

	constructor(private readonly key: string) {}

	public async lookup(fingerprint: string, duration: number): Promise<LookupOutcome> {
		// Both checks come before the throttle: a step that has given up should
		// cost nothing per poll, not a queued turn.
		if (this.rejected || Date.now() < this.cooldownUntil) {
			return { kind: "unavailable" }
		}

		await this.throttle()

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: this.form(fingerprint, duration),
				signal: controller.signal,
			})
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			const body = (await response.json()) as AcoustIdResponse
			if (body.status === "error") {
				return this.onServiceError(body.error?.code)
			}

			return { kind: "matched", matches: normalize(body.results ?? []) }
		} catch (error) {
			this.cooldownUntil = Date.now() + COOLDOWN_MS
			logger.warn(
				`AcoustID lookup failed: ${error instanceof Error ? error.name : "unknown error"}`,
			)
			return { kind: "unavailable" }
		} finally {
			clearTimeout(timeoutId)
		}
	}

	/**
	 * A POST, not a query string: the fingerprint of a four minute track is
	 * 3.7 KB and does not belong in a url.
	 */
	private form(fingerprint: string, duration: number): URLSearchParams {
		return new URLSearchParams({
			client: this.key,
			// Whole seconds, which is what the service matches against.
			duration: String(Math.round(duration)),
			fingerprint,
			// Space separated. Measured: a literal plus here arrives percent
			// encoded and the service answers ok with no recordings at all, which
			// reads as unknown audio and is not.
			meta: "recordings releasegroups",
		})
	}

	/**
	 * The error codes separate a broken install from audio the service cannot
	 * use, and the two deserve opposite treatment: one is permanent for this
	 * session, the other is a completed lookup that found nothing.
	 */
	private onServiceError(code: number | undefined): LookupOutcome {
		if (code !== undefined && CONFIGURATION_ERRORS.has(code)) {
			this.rejected = true
			// Once, and without the key or any part of it.
			logger.warn("AcoustID rejected the configured key, audio identification is off")
			return { kind: "unavailable" }
		}

		if (code === INVALID_FINGERPRINT) {
			return { kind: "matched", matches: [] }
		}

		this.cooldownUntil = Date.now() + COOLDOWN_MS
		logger.warn(`AcoustID answered with error code ${code ?? "none"}`)
		return { kind: "unavailable" }
	}

	/**
	 * Serialized on a chain, the way the other providers throttle: without it
	 * concurrent lookups all read the same lastRequestAt, compute the same wait
	 * and then fire together, which is what a rate limited service counts as a
	 * burst.
	 */
	private throttle(): Promise<void> {
		const turn = this.queue.then(async () => {
			const wait = MIN_INTERVAL_MS - (Date.now() - this.lastRequestAt)
			if (wait > 0) {
				await new Promise((resolve) => setTimeout(resolve, wait))
			}
			this.lastRequestAt = Date.now()
		})
		this.queue = turn
		return turn
	}
}
