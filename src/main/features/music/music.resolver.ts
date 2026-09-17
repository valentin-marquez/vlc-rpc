import { logger } from "@main/core/logger"
import type {
	AsIsOverride,
	AudioOverride,
	CorrectedTags,
	Override,
	OverrideTarget,
	UntaggedAudioOverride,
} from "@main/features/overrides"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { Cache } from "./music.cache"
import { splitCollaboration } from "./music.credit"
import {
	audioOverrideKey,
	fileOverrideKey,
	fingerprintKey,
	musicKey,
	overrideCoversTrack,
} from "./music.key"
import { albumMatches, pickBest } from "./music.scorer"
import type {
	AudioFileIdentity,
	AudioIdentifier,
	CandidateRelease,
	CoverArtSource,
	FileLocator,
	IdentifiedName,
	IdentifyOutcome,
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

type StepOutcome =
	| { kind: "resolved"; result: MusicResult }
	| { kind: "unresolved"; reason: UnresolvedReason }

/**
 * Whether a tag lookup that produced no cover leaves the audio worth hashing.
 *
 * AcoustID's limit is per application key and shared by every user of this app,
 * while iTunes and MusicBrainz are keyless and therefore limited per user. So
 * the fingerprint only follows a chain that actually ruled on the track, never
 * one that was unable to speak.
 */
function fingerprintFollows(reason: UnresolvedReason): boolean {
	switch (reason) {
		// The step's entire reason for existing: no tag names this file, so no text
		// search can ever find it and only the audio can.
		case "insufficient-tags":
		// The catalogs searched and hold nothing under that name, or held
		// something and none of it was this recording. Either way they have
		// answered, and the audio is the only thing left to ask.
		case "no-results":
		case "no-match":
			return true
		// The recording is already identified and only its artwork is missing, so a
		// fingerprint would spend a shared request to learn a name that is known,
		// and land on the same archive that had no image for it.
		case "no-cover":
		// The catalogs could not search at all, which says nothing about the track.
		// This entry expires in seconds and the next poll retries them, so letting
		// an outage of two per user services become traffic on the one shared key
		// would hit that key from every install at once, exactly when it is least
		// able to absorb it.
		case "provider-error":
			return false
	}
}

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

type AudioCorrection = AudioOverride | UntaggedAudioOverride | AsIsOverride

/**
 * The audio half of a correction, or `null` for a video one, which reaches this
 * feature only when a key from the other side is handed to it by mistake.
 */
function audioCorrection(override: Override | null): AudioCorrection | null {
	if (override === null || override.kind === "video") {
		return null
	}
	return override
}

/** Absent rather than empty, so "no cover typed" is one answer and not two. */
function coverOf(correction: AudioCorrection): string | undefined {
	if (correction.kind === "as-is") {
		return undefined
	}
	const cover = correction.kind === "audio" ? correction.cover : (correction.cover ?? "")
	return cover.length > 0 ? cover : undefined
}

/**
 * What a correction says the file is called, or `null` when it named nothing.
 * A correction that only picked a cover says nothing about the text, which is
 * what leaves an acoustic match free to supply it.
 */
function typedTags(correction: AudioCorrection | null): CorrectedTags | null {
	if (correction?.kind !== "untagged-audio") {
		return null
	}

	const tags: CorrectedTags = { source: "correction" }
	const title = correction.title?.trim() ?? ""
	const artist = correction.artist?.trim() ?? ""
	if (title.length > 0) tags.title = title
	if (artist.length > 0) tags.artist = artist

	return tags.title === undefined && tags.artist === undefined ? null : tags
}

/**
 * The query the catalogs are searched with once a correction has said what the
 * file is. Field by field rather than wholesale: a correction that names only
 * the artist still wants the file's own title, and the album tag is left alone
 * because it is the one thing such a file sometimes does carry.
 *
 * The corrected title goes through the same collaboration split the tag does,
 * so a user typing "Song (feat. X)" is measured the way a tag saying it would
 * be.
 */
function correctedQuery(query: TrackQuery, correction: UntaggedAudioOverride): TrackQuery {
	const artist = correction.artist?.trim() ?? ""
	const { title, collaborators } = splitCollaboration(correction.title?.trim() ?? "")

	return {
		artists: artist.length === 0 ? query.artists : [artist, ...collaborators],
		title: title.length === 0 ? query.title : title,
		album: query.album,
	}
}

/** The corrections the user typed by hand. A resolver only ever reads them. */
export interface OverrideLookup {
	get(key: string): Override | null
	/** Whether a save under this key would be taken, asked before offering it. */
	accepts(key: string): boolean
}

export class Resolver {
	private readonly inflight = new Map<string, Promise<StepOutcome>>()

	constructor(
		private readonly cache: Cache,
		private readonly itunes: MusicProvider,
		private readonly musicbrainz: MusicProvider,
		private readonly coverArt: CoverArtSource,
		private readonly overrides: OverrideLookup,
		/**
		 * Required, unlike the identifier below, because a correction must not
		 * depend on a binary this build may not carry.
		 */
		private readonly locator: FileLocator,
		/**
		 * Absent when no AcoustID key was configured, which is the normal case for
		 * a contributor who cloned the repository. Everything above this line then
		 * behaves exactly as it did before.
		 */
		private readonly identifier?: AudioIdentifier | undefined,
	) {}

	public async resolve(status: VlcStatus): Promise<MusicResult | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const rawQuery = buildQuery(status.media)

		const target = await this.overrideKeyFor(status, rawQuery)
		const correction = target === null ? null : audioCorrection(this.overrides.get(target.key))
		const cover = correction === null ? undefined : coverOf(correction)
		if (target !== null && cover !== undefined) {
			return { cover, provider: "override", id: target.key }
		}

		// A correction that named the file rather than picking an image for it does
		// not end the chain, it feeds it: the catalogs can be searched with what
		// the user typed, and an answer from them is better artwork than an address
		// they would have had to go and find.
		const query =
			correction?.kind === "untagged-audio" ? correctedQuery(rawQuery, correction) : rawQuery

		const byTags = await this.resolveByTags(query)
		if (byTags.kind === "resolved") {
			return byTags.result
		}

		// Last, and only for what the tags could not name. Hashing the audio is the
		// most expensive thing this feature does on the machine it runs on, and the
		// service it feeds is the one budget here that every user of this app
		// shares, so the miss has to be a verdict and not an outage.
		if (!fingerprintFollows(byTags.reason)) {
			return null
		}

		// The user has refused what this file was matched to, and that is a verdict
		// on the recording rather than on its name alone: the cover a match draws
		// belongs to the same recording the name came from. Refusing it here also
		// keeps a request the user does not want out of the shared budget.
		if (correction?.kind === "as-is") {
			return null
		}

		return await this.resolveByAudio(status, query)
	}

	/**
	 * The cover the user filed for this file, read from the store and nothing
	 * else. `resolve` answers this too, but only after the file's own artwork has
	 * already been preferred, and reaching it means a network round trip for every
	 * track that carries artwork of its own.
	 *
	 * A local read for anything the tags name, which is the common case. Audio
	 * that names nothing pays one playlist read per item to find out which file
	 * it is, memoized by the locator.
	 */
	public async overrideCoverFor(status: VlcStatus): Promise<string | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const target = await this.overrideKeyFor(status, buildQuery(status.media))
		const correction = target === null ? null : audioCorrection(this.overrides.get(target.key))
		return correction === null ? null : (coverOf(correction) ?? null)
	}

	/**
	 * What this file should read as, for audio that carries no tags of its own,
	 * and who says so.
	 *
	 * The presence text is built from tags and there are none, so without this a
	 * file the app has already identified still reads as its own file name on
	 * Discord. Two sources answer, in this order: what the user typed, then what
	 * the audio was matched to, and the second only when the match cleared the
	 * higher of the two fingerprint floors.
	 *
	 * Not merged field by field. A correction is the user having refused what the
	 * app deduced, so filling the half they left blank from the same deduction
	 * would put a credit on their profile they never agreed to, and it would
	 * leave the screen with a name half typed and half guessed that no single
	 * sentence could attribute.
	 *
	 * `null` for everything else, tagged audio included: the file already says
	 * what it is, and a correction there carries only a cover by design.
	 */
	public async correctedTagsFor(status: VlcStatus): Promise<CorrectedTags | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const target = await this.overrideKeyFor(status, buildQuery(status.media))
		// A file key is what audio gets when its tags name nothing the store can
		// file a record under, which is the same audio whose text is not its own.
		// Anything keyed by what the file claims to be already has a text.
		if (target === null || target.kind !== "file") {
			return null
		}

		const correction = audioCorrection(this.overrides.get(target.key))
		if (correction?.kind === "as-is") {
			return { source: "as-is" }
		}

		const typed = typedTags(correction)
		if (typed !== null) {
			return typed
		}

		const identified = await this.identifiedNameFor(status)
		return identified === null ? null : { ...identified, source: "identification" }
	}

	/**
	 * The name a fingerprint already filed for this file, read and never looked
	 * up. The lookup is the last step of the cover chain and spends the one
	 * budget every user of this app shares, so the text follows what that chain
	 * learned rather than asking the service for it a second time.
	 */
	private async identifiedNameFor(status: VlcStatus): Promise<IdentifiedName | null> {
		const file = await this.locator.fileFor(status)
		if (file === null) {
			return null
		}

		const cached = this.cache.get(fingerprintKey(file))
		if (cached === null) {
			return null
		}

		return (cached.status === "resolved" ? cached.result.name : cached.name) ?? null
	}

	/**
	 * Where a correction for this file would be filed, without resolving it. It
	 * has to come from here: the key is the record's, not the track's, and it is
	 * built from `buildQuery`, which holds the credit splitting rules and stays
	 * private to this file so there is only ever one derivation of it.
	 *
	 * `null` only when neither identity exists, which is a stream: nothing on
	 * disk to name and no tag naming it either.
	 */
	public async overrideTargetFor(status: VlcStatus): Promise<OverrideTarget | null> {
		if (status.mediaType !== "audio") {
			return null
		}

		const target = await this.overrideKeyFor(status, buildQuery(status.media))
		if (target === null) {
			return null
		}

		// Either audio shape counts. Testing for `audio` alone left a correction on
		// a file with no tags reported as absent, so the screen went on offering to
		// file one the user had just filed.
		return { ...target, active: audioCorrection(this.overrides.get(target.key)) !== null }
	}

	/**
	 * The one key this file's correction lives under, chosen rather than merged:
	 * a file is looked up under exactly the key it would be saved under, so a
	 * correction is never filed where nothing will look for it.
	 *
	 * The record key first, because it is the one worth having: it is shared by
	 * every track of a release, so one correction fixes the whole album and
	 * survives the file being moved, renamed or re-encoded. The store turns it
	 * down when the credit that leads it is empty, which is audio with no artist
	 * tag, and that is where the file itself takes over. It cannot collide, since
	 * two files are never one path, and it is the only identity such a file has:
	 * its title is usually a filename, and one correction under a filename would
	 * claim every rip that reused it.
	 *
	 * Adding an artist tag later therefore retires the file correction rather
	 * than moving it. That is the honest outcome: the file now says what it is,
	 * and a correction filed when it said nothing was never about the record.
	 */
	private async overrideKeyFor(
		status: VlcStatus,
		query: TrackQuery,
	): Promise<{ kind: OverrideTarget["kind"]; key: string } | null> {
		const byRecord = audioOverrideKey(query)
		if (this.overrides.accepts(byRecord)) {
			return { kind: "metadata", key: byRecord }
		}

		const file = await this.locator.fileFor(status)
		if (file === null) {
			return null
		}

		const byFile = fileOverrideKey(file.path)
		return this.overrides.accepts(byFile) ? { kind: "file", key: byFile } : null
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
	 *
	 * A correction filed against a file matches nothing here, deliberately. What
	 * it replaces is the fingerprint entry, and that entry is a function of the
	 * bytes: dropping it would spend a request against the one budget every user
	 * of this app shares to be told the same thing again. Removing such a
	 * correction therefore shows what the app deduces, which is what the entry
	 * already holds, and a file that is re-encoded retires it on its own since the
	 * fingerprint key carries the size and the modification time.
	 */
	public evictOverride(key: string): void {
		this.cache.deleteWhere((cached) => overrideCoversTrack(cached, key))
	}

	/**
	 * One answer per key: what is already cached, then what is already running
	 * for it, and only then the work. The two chains below reach this with keys
	 * from different key spaces, which is the whole point of the fingerprint one.
	 */
	private async once(key: string, work: () => Promise<StepOutcome>): Promise<StepOutcome> {
		const cached = this.cache.get(key)
		if (cached) {
			return cached.status === "resolved"
				? { kind: "resolved", result: cached.result }
				: { kind: "unresolved", reason: cached.reason }
		}

		const existing = this.inflight.get(key)
		if (existing) {
			return existing
		}

		const promise = work()
		this.inflight.set(key, promise)

		try {
			return await promise
		} finally {
			this.inflight.delete(key)
		}
	}

	/** A miss carries its reason out, because what follows it depends on it. */
	private async resolveByTags(query: TrackQuery): Promise<StepOutcome> {
		const key = musicKey(query)
		return await this.once(key, () => this.resolveUncached(query, key))
	}

	/** Cached with the reason it happened, and answered with the same one. */
	private miss(key: string, reason: UnresolvedReason, name?: IdentifiedName): StepOutcome {
		this.cache.setUnresolved(key, reason, name)
		return { kind: "unresolved", reason }
	}

	/**
	 * The fingerprint step, keyed by the file rather than by the tags. Two files
	 * with no tags derive the same track key, so the entry that remembers what
	 * the audio said has to be named after the audio's file.
	 */
	private async resolveByAudio(status: VlcStatus, query: TrackQuery): Promise<MusicResult | null> {
		const identifier = this.identifier
		if (identifier === undefined) {
			return null
		}

		const file = await this.locate(identifier, status)
		if (file === null) {
			return null
		}

		const key = fingerprintKey(file)
		const outcome = await this.once(key, () =>
			this.identifyUncached(identifier, file, key, query.album),
		)
		// Nothing runs after this step, so its reason has no reader.
		return outcome.kind === "resolved" ? outcome.result : null
	}

	private async locate(
		identifier: AudioIdentifier,
		status: VlcStatus,
	): Promise<AudioFileIdentity | null> {
		try {
			return await identifier.fileFor(status)
		} catch {
			logger.warn("Could not tell which file VLC is playing")
			return null
		}
	}

	private async identifyUncached(
		identifier: AudioIdentifier,
		file: AudioFileIdentity,
		key: string,
		album: string | undefined,
	): Promise<StepOutcome> {
		let outcome: IdentifyOutcome
		try {
			outcome = await identifier.identify(file)
		} catch {
			// The step is the last one in the chain and it hangs off a child
			// process, so a throw here reaches the poll loop. It stops being an
			// exception and becomes a miss worth retrying.
			logger.warn("Audio identification failed")
			outcome = { kind: "unavailable" }
		}

		if (outcome.kind === "unavailable") {
			return this.miss(key, "provider-error")
		}
		if (outcome.kind === "unidentified") {
			return this.miss(key, outcome.reason)
		}

		// Absent unless the match cleared the naming floor, which is higher than
		// the one that let it through at all.
		const name = outcome.name ?? undefined

		try {
			const cover = await this.artworkFor(outcome.recording, album)
			if (cover === null) {
				// The recording is named and has no artwork anywhere. That is a miss
				// for the cover and an answer for the text, and both are this entry's
				// to remember.
				return this.miss(key, "no-cover", name)
			}

			const result: MusicResult = {
				cover,
				provider: "acoustid",
				id: outcome.recording.id,
				...(name === undefined ? {} : { name }),
			}
			this.cache.setResolved(key, result)
			return { kind: "resolved", result }
		} catch {
			logger.warn("Music cover lookup failed after a fingerprint match")
			return this.miss(key, "provider-error")
		}
	}

	private async resolveUncached(query: TrackQuery, key: string): Promise<StepOutcome> {
		if (!isSearchable(query)) {
			return this.miss(key, "insufficient-tags")
		}

		const outcome = await this.runChain(query)
		if (outcome.kind === "resolved") {
			this.cache.setResolved(key, outcome.result)
			return outcome
		}

		return this.miss(key, outcome.reason)
	}

	/**
	 * A chain, not a pool: iTunes answers in one request and ships the cover
	 * with it, while MusicBrainz needs a throttled search plus a Cover Art
	 * Archive hop. Running those anyway after a match that produced a cover would
	 * spend exactly what the order is there to save.
	 */
	private async runChain(query: TrackQuery): Promise<StepOutcome> {
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
