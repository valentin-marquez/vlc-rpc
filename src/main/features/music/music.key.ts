import { createHash } from "node:crypto"
import { normalize } from "@main/core/similarity"
import type { AudioFileIdentity, TrackQuery } from "./music.types"

const TRACK_PREFIX = "track:"
const AUDIO_OVERRIDE_PREFIX = "audio:"
const FINGERPRINT_PREFIX = "fp:"

/**
 * Cache identity of a track query: credit, title and album, normalized.
 *
 * The album is in the key even though two album tags can name the same
 * recording. Identity is not what this key buys: the resolver picks which
 * release supplies the cover by that same tag, so the album track and the
 * single resolve to two different covers, and one key for both would serve
 * whichever resolved first to both files for the life of the entry.
 *
 * The credit is sorted so the entry does not depend on the order the tag and
 * the title's collaboration suffix happened to be read in.
 */
export function musicKey(query: TrackQuery): string {
	const artists = query.artists
		.map(normalize)
		.filter((artist) => artist.length > 0)
		.sort()
	return `${TRACK_PREFIX}${artists.join("|")}|${normalize(query.title)}|${normalize(query.album ?? "")}`
}

/**
 * Where an audio override is filed, which is deliberately not `musicKey` above.
 * `musicKey` carries the normalized album because it identifies a recording,
 * which is what a cache entry is about. An override is about a record's artwork:
 * filed per track, correcting one album cover would mean typing the same
 * correction once per song, twenty times for a twenty track release.
 *
 * So the key is the credit plus the album, falling back to the title when the
 * file carries no album tag. The credit is the artist tag alone, without the
 * collaborators the title's suffix contributed, since those change from track to
 * track and would split one album back into one key per song. It leads the key
 * because the store refuses to save under a key whose first component is empty,
 * which is what keeps a file with no artist tag from claiming the cover of every
 * other file with no artist tag.
 */
export function audioOverrideKey(query: TrackQuery): string {
	const artist = normalize(query.artists[0] ?? "")
	const album = normalize(query.album ?? "")
	return `${AUDIO_OVERRIDE_PREFIX}${artist}|${album.length > 0 ? album : normalize(query.title)}`
}

/**
 * Cache identity of an answer that came from the audio itself.
 *
 * Deliberately not `musicKey`. A file with no tags produces a query with an
 * empty credit and a placeholder title, so every untagged file in a library
 * derives the same track key, and one entry under it would hand the first
 * cover identified to all of them. What the fingerprint answers about is the
 * file, so the file is what names the entry: the path, plus the size and the
 * modification time, so re-encoding or replacing the file stops the old answer
 * rather than serving it for a day.
 *
 * Hashed because the value is a path of unbounded length that lands in a json
 * file the user can open, and nothing ever needs to read it back.
 */
export function fingerprintKey(file: AudioFileIdentity): string {
	const identity = `${file.path}|${file.size}|${file.modifiedAt}`
	return `${FINGERPRINT_PREFIX}${createHash("sha1").update(identity).digest("hex")}`
}

/**
 * Whether a cache key names a track that the audio override filed at
 * `overrideKey` corrects, which is what saving or deleting that override has to
 * evict. It reads the two key shapes apart rather than comparing them, because
 * they do not line up: the override is one per record while the cache key is one
 * per track and puts the album last, after a credit of unknown length, so the
 * track keys can be neither computed from the override key nor prefix matched
 * against it.
 *
 * The credit is tested by membership because `musicKey` sorts it, which loses
 * which name came from the artist tag. A track where the override's artist is
 * only a guest can therefore match, and the same album title by two artists
 * evicts both. That direction is the safe one: an extra eviction costs one
 * lookup, while a track left behind keeps serving the cover the user corrected.
 */
export function overrideCoversTrack(cacheKey: string, overrideKey: string): boolean {
	if (!cacheKey.startsWith(TRACK_PREFIX) || !overrideKey.startsWith(AUDIO_OVERRIDE_PREFIX)) {
		return false
	}

	const separator = overrideKey.indexOf("|")
	if (separator < 0) return false
	const artist = overrideKey.slice(AUDIO_OVERRIDE_PREFIX.length, separator)
	const record = overrideKey.slice(separator + 1)

	// `normalize` collapses everything that is not a letter or a digit, the pipe
	// included, so no component can hold the separator these are split on.
	const parts = cacheKey.slice(TRACK_PREFIX.length).split("|")
	const album = parts.at(-1) ?? ""
	const title = parts.at(-2) ?? ""
	const artists = parts.slice(0, -2)

	if (!artists.includes(artist)) return false
	return album.length > 0 ? album === record : title === record
}
