import { normalize } from "@main/core/similarity"
import type { TrackQuery } from "./music.types"

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
	return `track:${artists.join("|")}|${normalize(query.title)}|${normalize(query.album ?? "")}`
}
