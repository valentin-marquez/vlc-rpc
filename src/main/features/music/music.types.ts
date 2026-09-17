import type { VlcStatus } from "@shared/vlc/vlc.types"

export interface TrackQuery {
	/**
	 * The credit the file claims: the artist tag verbatim in the first entry,
	 * plus one entry per name the title's collaboration suffix credited.
	 *
	 * The tag is never split on punctuation. Commas, slashes and ampersands sit
	 * inside ordinary artist names ("AC/DC", "Earth, Wind & Fire", "Tyler, The
	 * Creator") far more often than they separate two artists, and the providers
	 * do not split them either: iTunes answers "Lady Gaga & Bradley Cooper" as a
	 * single `artistName`. The scorer compares both sides whole and name by name.
	 */
	artists: string[]
	/** Without the collaboration suffix, the shape the candidates arrive in. */
	title: string
	album?: string | undefined
}

export interface CandidateRelease {
	/** MusicBrainz release MBID, the key against Cover Art Archive. */
	id?: string | undefined
	title: string
	date?: string | undefined
	releaseGroupId?: string | undefined
	/** iTunes ships the cover in the search response itself. */
	coverUrl?: string | undefined
}

export interface RecordingCandidate {
	provider: "itunes" | "musicbrainz" | "acoustid"
	id: string
	/** Without the collaboration suffix, which the normalizer moves into artists. */
	title: string
	/** Full credit, collaborators included. */
	artists: string[]
	/**
	 * A list, not a single id. The top MusicBrainz recording for the test track
	 * carries six releases and the first is a compilation that does have
	 * artwork, so taking the first would show a greatest hits cover for a
	 * correct identification, the worst failure this feature can produce. The
	 * list is what lets the resolver prefer the release matching the file's
	 * album tag and fall through when one has no art.
	 */
	releases: CandidateRelease[]
	/**
	 * 0-based position in the order the provider returned, lower is better.
	 * Deliberately not the provider's own score: MusicBrainz returns a relevance
	 * score where higher is better, so storing that here would invert every
	 * tie break.
	 */
	rank: number
}

/**
 * Un proveedor devuelve lista vacia cuando busco bien y no encontro nada, y
 * lanza cuando no pudo buscar. El resolver necesita esa diferencia: lo primero
 * es un hecho del catalogo y se cachea largo, lo segundo es infraestructura y
 * se cachea corto.
 */
export interface MusicProvider {
	search(query: TrackQuery): Promise<RecordingCandidate[]>
}

/**
 * Misma convencion de tres canales que MusicProvider: una URL cuando hay
 * portada, `null` cuando el archivo de arte no existe para esa release (un 404
 * es una respuesta, no un error), y lanza cuando la consulta no se pudo hacer.
 */
export interface CoverArtSource {
	coverFor(release: CandidateRelease): Promise<string | null>
}

/**
 * What a confident acoustic match says the audio is, for a file whose own tags
 * say nothing. Both halves or neither: a title over a blank credit reads as a
 * song nobody recorded, which is worse than the file name it replaced.
 */
export interface IdentifiedName {
	title: string
	artist: string
}

export interface MusicResult {
	cover: string
	/** `override` is the user, who outranks both catalogs and is asked first. */
	provider: "itunes" | "musicbrainz" | "override" | "acoustid"
	id: string
	/**
	 * Present only when the audio was matched confidently enough to rename the
	 * file, which is a higher bar than the one that produced this cover. It
	 * rides along with the result because the presence text needs it on a later
	 * poll, long after the lookup that learned it.
	 */
	name?: IdentifiedName | undefined
}

/** What one run of the fingerprinting binary produced. */
export type FingerprintOutcome =
	| { kind: "fingerprinted"; fingerprint: string; duration: number }
	/** This install has no fpcalc, so the step does not exist here. */
	| { kind: "absent" }
	/** The binary ran and could not turn this file into a fingerprint. */
	| { kind: "failed" }

export interface AudioFingerprinter {
	/**
	 * Whether the binary is installed, answered without spawning anything. The
	 * step reads it before doing any work at all, so a platform with no build
	 * costs a boolean per poll instead of a process.
	 */
	readonly available: boolean
	fingerprint(filePath: string): Promise<FingerprintOutcome>
}

/**
 * One AcoustID result crossed with one of the recordings it names. The service
 * scores the audio, not the recording, so every recording under one result
 * carries that result's score.
 */
export interface FingerprintMatch {
	/** The service's own confidence that this is the same audio, 0 to 1. */
	score: number
	/** MusicBrainz recording MBID. */
	id: string
	title: string
	artists: string[]
	/** Release groups, ordered so a proper album outranks a compilation. */
	releases: CandidateRelease[]
	/** 0-based position in the order the service returned, lower is better. */
	rank: number
}

/**
 * How far one acoustic answer is trusted. Two bars rather than one because the
 * consequences differ: a cover that is refused shows nothing, which is honest,
 * while text is always shown and replacing it is a claim about what the file
 * is. `cover-only` is a match that earned the picture and not the words.
 */
export type Identification =
	| { kind: "unidentified" }
	| { kind: "cover-only"; match: FingerprintMatch }
	| { kind: "named"; match: FingerprintMatch }

/**
 * The same three channels the other providers use, as a union rather than an
 * empty array standing in for two different things: an empty `matches` is the
 * service saying it does not know this audio, which is cached for a day, while
 * `unavailable` is a request that never happened and is retried in seconds.
 */
export type LookupOutcome =
	| { kind: "matched"; matches: FingerprintMatch[] }
	| { kind: "unavailable" }

export interface AudioIdLookup {
	/**
	 * Whether a lookup right now would reach the service, answered without a
	 * request. Hashing the audio is what the caller pays to be able to ask, so it
	 * asks this first, and the reasons a lookup cannot happen (a cooldown, a
	 * rejected key) stay owned by the implementation that set them.
	 */
	readonly available: boolean
	lookup(fingerprint: string, duration: number): Promise<LookupOutcome>
}

/**
 * What names a file for this feature. Not the path alone: the cache entry has
 * to stop answering once the bytes behind the path change.
 */
export interface AudioFileIdentity {
	path: string
	size: number
	modifiedAt: number
}

/**
 * Which file on disk VLC is playing. Split out from the identifier because a
 * correction needs the same answer and must not depend on the optional binary
 * the identifier is gated on.
 */
export interface FileLocator {
	/** `null` when the playing item is not a local file, a stream for instance. */
	fileFor(status: VlcStatus): Promise<AudioFileIdentity | null>
}

export type IdentifyOutcome =
	| {
			kind: "identified"
			recording: RecordingCandidate
			/** `null` when the match earned the cover and not the file's name. */
			name: IdentifiedName | null
	  }
	/** The audio was read and nothing came back that could be trusted. */
	| { kind: "unidentified"; reason: "no-results" | "no-match" }
	/** Nothing was learned about the file, so the answer is worth retrying. */
	| { kind: "unavailable" }

/**
 * Identifying a recording from the audio itself, which is the only thing left
 * for a file whose tags say nothing.
 */
export interface AudioIdentifier {
	/** `null` when the playing item is not a local file, a stream for instance. */
	fileFor(status: VlcStatus): Promise<AudioFileIdentity | null>
	identify(file: AudioFileIdentity): Promise<IdentifyOutcome>
}

export type UnresolvedReason =
	| "insufficient-tags"
	| "no-results"
	| "no-match"
	| "no-cover"
	| "provider-error"

export type CacheEntry =
	| { status: "resolved"; version: number; result: MusicResult; lastAccessedAt: number }
	/**
	 * The reason is stored, not just the expiry: what comes after a miss depends
	 * on whether the catalogs ruled on the track or could not answer at all, and a
	 * cached miss has to answer that question the same way a fresh one does.
	 */
	| {
			status: "unresolved"
			version: number
			reason: UnresolvedReason
			expiresAt: number
			lastAccessedAt: number
			/**
			 * A recording can be named and still have no artwork anywhere, which is
			 * a miss for the cover and an answer for the text. Kept here so that
			 * file reads as the song it is rather than as its own file name.
			 */
			name?: IdentifiedName | undefined
	  }
