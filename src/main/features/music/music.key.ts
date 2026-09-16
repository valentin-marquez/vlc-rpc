import { normalize } from "@main/core/similarity"
import type { TrackQuery } from "./music.types"

/**
 * Cache identity of a track query: artists plus title, normalized.
 *
 * The album is deliberately out. The same recording tagged with two different
 * album names is the same recording, and including it would fragment the cache
 * for nothing.
 *
 * Artists are sorted because splitting a tag is not order guaranteed, so the
 * same file must not land on two keys depending on how its credit was written.
 */
export function musicKey(query: TrackQuery): string {
	const artists = query.artists
		.map(normalize)
		.filter((artist) => artist.length > 0)
		.sort()
	return `track:${artists.join("|")}|${normalize(query.title)}`
}
