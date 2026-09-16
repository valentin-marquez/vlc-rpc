import { logger } from "@main/core/logger"
import { app } from "electron"
import type { CandidateRelease, MusicProvider, RecordingCandidate, TrackQuery } from "./music.types"

const ENDPOINT = "https://musicbrainz.org/ws/2/recording"
const MIN_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 5000
const RESULT_LIMIT = 5
const CONTACT_URL = "https://github.com/Valentin-Marquez/vlc-rpc"

interface MusicBrainzArtistCredit {
	name?: string
	artist?: { name?: string }
}

interface MusicBrainzRelease {
	id?: string
	title: string
	date?: string
	"release-group"?: { id?: string }
}

interface MusicBrainzRecording {
	id: string
	title: string
	"artist-credit"?: MusicBrainzArtistCredit[]
	releases?: MusicBrainzRelease[]
}

interface MusicBrainzSearchResponse {
	error?: string
	count?: number
	recordings?: MusicBrainzRecording[]
}

/**
 * A double quote inside a title would close the phrase and leave Lucene with a
 * query it cannot parse, which the service answers as a client error rather
 * than as zero results.
 */
function escapeLucene(value: string): string {
	return value.replace(/(["\\])/g, "\\$1")
}

/**
 * MusicBrainz covers what Apple does not sell. One request per second, and an
 * identifying User-Agent, are conditions of use, not tuning.
 */
export class MusicBrainzProvider implements MusicProvider {
	private lastRequestAt = 0
	// Same serialized chain as AniListProvider: without it concurrent searches
	// all read the same lastRequestAt, compute the same wait and fire together,
	// which is exactly what a rate limited service counts as one burst.
	private queue: Promise<void> = Promise.resolve()

	public async search(query: TrackQuery): Promise<RecordingCandidate[]> {
		await this.throttle()

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(this.buildUrl(query), {
				headers: { "User-Agent": this.userAgent() },
				signal: controller.signal,
			})
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			const body = (await response.json()) as MusicBrainzSearchResponse
			// A saturated MusicBrainz answers with a normal shaped JSON body that
			// carries an `error` key, so the status alone cannot tell "searched and
			// found nothing" apart from "could not search". Measured it arrived with
			// HTTP 503, but trusting only the status is what costs the track: an
			// empty array is a fact about the catalog and the resolver caches it for
			// a day, so one busy minute would leave the file without a cover.
			if (typeof body.error === "string") {
				throw new Error("MusicBrainz returned an error in the response body")
			}

			return (body.recordings ?? []).map((recording, index) => this.normalize(recording, index))
		} catch (error) {
			logger.warn(
				`MusicBrainz search failed: ${error instanceof Error ? error.message : "unknown error"}`,
			)
			throw error
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private buildUrl(query: TrackQuery): string {
		// Artist and title only. Measured: adding `AND release:"Ahora"` took a
		// search that returned five recordings down to count 0. The album tag
		// orients the ranking downstream, it never enters the query. The first
		// credited artist for the same reason, a tag that packs several names
		// would over constrain the same way, and the scorer compares against the
		// whole credit anyway.
		const artist = query.artists.find((name) => name.trim().length > 0)
		const clauses = artist
			? [`artist:"${escapeLucene(artist)}"`, `recording:"${escapeLucene(query.title)}"`]
			: [`recording:"${escapeLucene(query.title)}"`]

		const params = new URLSearchParams({
			query: clauses.join(" AND "),
			fmt: "json",
			limit: String(RESULT_LIMIT),
		})
		return `${ENDPOINT}?${params.toString()}`
	}

	private userAgent(): string {
		return `vlc-rpc/${app.getVersion()} ( ${CONTACT_URL} )`
	}

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

	private normalize(recording: MusicBrainzRecording, index: number): RecordingCandidate {
		const artists = (recording["artist-credit"] ?? [])
			.map((credit) => credit.name ?? credit.artist?.name ?? "")
			.filter((name) => name.length > 0)

		return {
			provider: "musicbrainz",
			id: recording.id,
			title: recording.title,
			artists,
			releases: (recording.releases ?? []).map((release) => this.normalizeRelease(release)),
			// Position, not the service's own score. MusicBrainz scores higher is
			// better, and rank is lower is better.
			rank: index,
		}
	}

	private normalizeRelease(release: MusicBrainzRelease): CandidateRelease {
		return {
			id: release.id,
			title: release.title,
			date: release.date,
			releaseGroupId: release["release-group"]?.id,
		}
	}
}
