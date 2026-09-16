import { logger } from "@main/core/logger"
import type { Override, OverrideTarget } from "@main/features/overrides"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Cache } from "./music.cache"
import { splitCollaboration } from "./music.credit"
import { audioOverrideKey, musicKey, overrideCoversTrack } from "./music.key"
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

function buildQuery(media: VlcStatus["media"]): TrackQuery {
	const artist = media.artist?.trim() ?? ""
	// The suffix leaves the title on both sides of the comparison or on neither.
	// The candidates arrive stripped, so a tag like "Love the Way You Lie (feat.
	// Rihanna)" measured 0.745 against a 0.92 gate and resolved to nothing.
	const { title, collaborators } = splitCollaboration(media.title?.trim() ?? "")

	// The tag is deliberately not split on commas, slashes, semicolons or
	// ampersands. Every one of those belongs inside an artist name far more
	// often than it separates two: splitting turned "AC/DC" into two names that
	// match no candidate, excluded the correct one at the identity gate, and
	// cached that miss for a day.
	return {
		artists: artist.length === 0 ? [] : [artist, ...collaborators],
		title,
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

/** The corrections the user typed by hand. A resolver only ever reads them. */
export interface OverrideLookup {
	get(key: string): Override | null
	/** Whether a save under this key would be taken, asked before offering it. */
	accepts(key: string): boolean
}

export class Resolver {
	private readonly inflight = new Map<string, Promise<MusicResult | null>>()

	constructor(
		private readonly cache: Cache,
		private readonly itunes: MusicProvider,
		private readonly musicbrainz: MusicProvider,
		private readonly coverArt: CoverArtSource,
		private readonly overrides: OverrideLookup,
	) {}

	public async resolve(status: VlcStatus): Promise<MusicResult | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const query = buildQuery(status.media)

		const overrideAt = audioOverrideKey(query)
		const override = this.overrides.get(overrideAt)
		if (override?.kind === "audio") {
			return { cover: override.cover, provider: "override", id: overrideAt }
		}

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

	/**
	 * Where a correction for this file would be filed, without resolving it. It
	 * has to come from here: the key is the record's, not the track's, and it is
	 * built from `buildQuery`, which holds the credit splitting rules and stays
	 * private to this file so there is only ever one derivation of it.
	 *
	 * `null` when the store would turn the key down, which for audio means a file
	 * with no artist tag: its cover would otherwise become every untagged file's.
	 */
	public overrideTargetFor(status: VlcStatus): OverrideTarget | null {
		if (status.mediaType !== "audio") {
			return null
		}

		const key = audioOverrideKey(buildQuery(status.media))
		if (!this.overrides.accepts(key)) {
			return null
		}

		return { key, active: this.overrides.get(key)?.kind === "audio" }
	}

	/**
	 * Drops what was cached for the record an audio override names, so removing
	 * the correction later shows what the app deduces now and not the answer that
	 * was cached before the correction was typed.
	 *
	 * It cannot be the cache's `delete`, the way the catalog's is. An override is
	 * filed per record, the cache is keyed per track, and that key carries the
	 * album last, after a credit of unknown length: the track keys of an album
	 * cannot be derived from the override key, and no prefix of one is a prefix of
	 * the others. Every cached key has to be tested instead.
	 */
	public evictOverride(key: string): void {
		this.cache.deleteWhere((cached) => overrideCoversTrack(cached, key))
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
	 * Archive hop. Running those anyway after a match that produced a cover would
	 * spend exactly what the order is there to save.
	 */
	private async runChain(query: TrackQuery): Promise<ChainOutcome> {
		let providerFailed = false
		let sawCandidates = false
		let identifiedWithoutCover = false

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
				// This catalog has the recording and no artwork for it. The next one
				// may still have both, and it is a cheap chain to finish.
				identifiedWithoutCover = true
			} catch {
				logger.warn(`Music cover lookup failed after a ${name} match`)
				providerFailed = true
			}
		}

		// Each reason describes the outcome that actually happened, in order of how
		// much it says about the track. An identification with no artwork is a fact
		// about the recording and outlives a sibling provider's hiccup, while a
		// failure inside the artwork lookup itself never reaches that conclusion and
		// stays transient.
		if (identifiedWithoutCover) {
			return { kind: "unresolved", reason: "no-cover" }
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
