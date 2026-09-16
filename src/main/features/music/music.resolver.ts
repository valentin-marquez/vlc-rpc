import { logger } from "@main/core/logger"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Cache } from "./music.cache"
import { musicKey } from "./music.key"
import { albumMatches, pickBest } from "./music.scorer"
import type {
	CandidateRelease,
	CoverArtSource,
	MusicProvider,
	MusicResult,
	RecordingCandidate,
	TrackQuery,
	UnresolvedReason,
} from "./music.types"

/**
 * Tags pack several performers into one field. The slash is the ID3
 * convention; commas, semicolons and ampersands are what taggers and players
 * write in practice.
 */
const ARTIST_SEPARATORS = /[,;/&]/

/**
 * The mapper falls back to the filename when no title tag exists, so a title
 * ending in one of these is a filename wearing a title's clothes.
 */
const AUDIO_EXTENSION =
	/\.(?:mp3|m4a|m4b|aac|flac|alac|ogg|oga|opus|wav|wma|aiff?|ape|mpc|mka|dsf|dff)$/i

/** The literal the mapper writes when every title source is missing. */
const UNTAGGED_TITLE = "Unknown"

type ChainOutcome =
	| { kind: "resolved"; result: MusicResult }
	| { kind: "unresolved"; reason: UnresolvedReason }

interface ChainStep {
	name: string
	provider: MusicProvider
}

function splitArtists(artist: string | undefined): string[] {
	if (!artist) return []
	return artist
		.split(ARTIST_SEPARATORS)
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
}

function buildQuery(media: VlcStatus["media"]): TrackQuery {
	return {
		artists: splitArtists(media.artist),
		title: media.title?.trim() ?? "",
		album: media.album?.trim() || undefined,
	}
}

/**
 * The live client fills `artist` with `""` and falls `title` through a cascade
 * that ends in a literal, so absent tags arrive as sentinels rather than as
 * `undefined`.
 */
function isSearchable(query: TrackQuery): boolean {
	if (query.artists.length === 0) return false
	if (query.title.length === 0 || query.title === UNTAGGED_TITLE) return false
	return !AUDIO_EXTENSION.test(query.title)
}

function albumRank(release: CandidateRelease, album: string | undefined): number {
	return albumMatches(album ?? "", release.title) ? 1 : 0
}

/**
 * iTunes dates are full ISO timestamps and MusicBrainz ones are bare dates,
 * sometimes only a year, so they are compared as parsed instants instead of as
 * strings. A release with no usable date sorts last: unknown is not early.
 */
function releaseTime(date: string | undefined): number {
	if (date === undefined) return Number.POSITIVE_INFINITY
	const parsed = Date.parse(date)
	return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/**
 * The order the releases of one candidate are tried in: the edition matching
 * the album tag first, then the earliest, so a correct identification does not
 * show the cover of a greatest hits compilation.
 */
function orderReleases(
	releases: CandidateRelease[],
	album: string | undefined,
): CandidateRelease[] {
	return releases
		.map((release, index) => ({ release, index }))
		.sort((a, b) => {
			const byAlbum = albumRank(b.release, album) - albumRank(a.release, album)
			if (byAlbum !== 0) return byAlbum

			const timeA = releaseTime(a.release.date)
			const timeB = releaseTime(b.release.date)
			if (timeA !== timeB) return timeA < timeB ? -1 : 1

			// Arbitrary on purpose. Between an album and a single of the same
			// recording both covers are correct and nothing is left to prefer, so
			// what matters is that the pick is deterministic rather than hostage to
			// the order the API happened to return.
			return a.index - b.index
		})
		.map((entry) => entry.release)
}

export class Resolver {
	private readonly inflight = new Map<string, Promise<MusicResult | null>>()

	constructor(
		private readonly cache: Cache,
		private readonly itunes: MusicProvider,
		private readonly musicbrainz: MusicProvider,
		private readonly coverArt: CoverArtSource,
	) {}

	public async resolve(status: VlcStatus): Promise<MusicResult | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const query = buildQuery(status.media)
		const key = musicKey(query)

		const cached = this.cache.get(key)
		if (cached) {
			return cached.status === "resolved" ? cached.result : null
		}

		const existing = this.inflight.get(key)
		if (existing) {
			return existing
		}

		const promise = this.resolveUncached(query, key)
		this.inflight.set(key, promise)

		try {
			return await promise
		} finally {
			this.inflight.delete(key)
		}
	}

	private async resolveUncached(query: TrackQuery, key: string): Promise<MusicResult | null> {
		if (!isSearchable(query)) {
			this.cache.setUnresolved(key, "insufficient-tags")
			return null
		}

		const outcome = await this.runChain(query)
		if (outcome.kind === "resolved") {
			this.cache.setResolved(key, outcome.result)
			return outcome.result
		}

		this.cache.setUnresolved(key, outcome.reason)
		return null
	}

	/**
	 * A chain, not a pool: iTunes answers in one request and ships the cover
	 * with it, while MusicBrainz needs a throttled search plus a Cover Art
	 * Archive hop. Running those anyway after a confident match would spend
	 * exactly what the order is there to save.
	 */
	private async runChain(query: TrackQuery): Promise<ChainOutcome> {
		let providerFailed = false
		let sawCandidates = false

		for (const { name, provider } of this.chain()) {
			const candidates = await this.search(provider, name, query)
			if (candidates === null) {
				providerFailed = true
				continue
			}
			if (candidates.length === 0) continue

			sawCandidates = true
			const best = pickBest(query, candidates)
			if (best === null) continue

			try {
				const cover = await this.artworkFor(best, query.album)
				if (cover !== null) {
					return { kind: "resolved", result: { cover, provider: best.provider, id: best.id } }
				}
			} catch {
				logger.warn(`Music cover lookup failed after a ${name} match`)
				providerFailed = true
			}

			// The recording is identified, so the chain is done either way: no
			// artwork is a fact about this recording, not a failure to match it.
			return { kind: "unresolved", reason: providerFailed ? "provider-error" : "no-cover" }
		}

		if (providerFailed) {
			return { kind: "unresolved", reason: "provider-error" }
		}
		return { kind: "unresolved", reason: sawCandidates ? "no-match" : "no-results" }
	}

	private chain(): ChainStep[] {
		return [
			{ name: "iTunes", provider: this.itunes },
			{ name: "MusicBrainz", provider: this.musicbrainz },
		]
	}

	/** `null` means the provider could not search, which is not having nothing. */
	private async search(
		provider: MusicProvider,
		name: string,
		query: TrackQuery,
	): Promise<RecordingCandidate[] | null> {
		try {
			return await provider.search(query)
		} catch {
			// The provider already logged the cause, and the error carries a
			// request URL, so only the step name is recorded here.
			logger.warn(`Music provider search failed: ${name}`)
			return null
		}
	}

	private async artworkFor(
		candidate: RecordingCandidate,
		album: string | undefined,
	): Promise<string | null> {
		for (const release of orderReleases(candidate.releases, album)) {
			if (release.coverUrl) {
				return release.coverUrl
			}

			const cover = await this.coverArt.coverFor(release)
			if (cover !== null) {
				return cover
			}
		}

		return null
	}
}
