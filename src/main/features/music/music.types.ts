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
	provider: "itunes" | "musicbrainz"
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

export interface MusicResult {
	cover: string
	provider: "itunes" | "musicbrainz"
	id: string
}

export type UnresolvedReason =
	| "insufficient-tags"
	| "no-results"
	| "no-match"
	| "no-cover"
	| "provider-error"

export type CacheEntry =
	| { status: "resolved"; version: number; result: MusicResult; lastAccessedAt: number }
	| { status: "unresolved"; version: number; expiresAt: number; lastAccessedAt: number }
