/**
 * Reads an override key back into the thing it matches.
 *
 * The key shapes are built in the main process (`catalog.key.ts` and
 * `music.key.ts`) and travel to the renderer as an opaque string, so this is a
 * copy of that grammar rather than a shared function. It stays a parser, never
 * a builder: nothing here can put a new key into the store, so a drift shows up
 * as a key this file cannot read, which it renders raw instead of guessing.
 */
export type OverrideMatch =
	| { kind: "tv"; title: string; season: string }
	| { kind: "movie"; title: string; year: string }
	| { kind: "video"; title: string }
	| { kind: "audio"; artist: string; record: string }
	| { kind: "unreadable"; key: string }

export function readOverrideKey(key: string): OverrideMatch {
	const colon = key.indexOf(":")
	if (colon === -1) {
		return { kind: "unreadable", key }
	}

	const prefix = key.slice(0, colon)
	const rest = key.slice(colon + 1)

	if (prefix === "tv" || prefix === "movie") {
		// The title can hold a pipe, the season and the year cannot, so the split is from the right.
		const pipe = rest.lastIndexOf("|")
		const title = rest.slice(0, pipe)
		const tail = rest.slice(pipe + 1)
		if (pipe === -1 || title.length === 0 || tail.length === 0) {
			return { kind: "unreadable", key }
		}
		return prefix === "tv"
			? { kind: "tv", title, season: tail }
			: { kind: "movie", title, year: tail }
	}

	if (prefix === "video") {
		return rest.length > 0 ? { kind: "video", title: rest } : { kind: "unreadable", key }
	}

	if (prefix === "audio") {
		const pipe = rest.indexOf("|")
		const artist = rest.slice(0, pipe)
		const record = rest.slice(pipe + 1)
		if (pipe === -1 || artist.length === 0 || record.length === 0) {
			return { kind: "unreadable", key }
		}
		return { kind: "audio", artist, record }
	}

	return { kind: "unreadable", key }
}

/** The name to lead a list row with, when the override carries no title of its own. */
export function matchHeadline(match: OverrideMatch): string {
	switch (match.kind) {
		case "tv":
		case "movie":
		case "video":
			return match.title
		case "audio":
			return match.record
		case "unreadable":
			return match.key
	}
}

/**
 * The key spelled out, because two releases of one title produce two keys and a
 * user who cannot see which one an override is filed under reads a correction
 * that stopped applying as a broken feature.
 */
export function describeOverrideMatch(match: OverrideMatch): string {
	switch (match.kind) {
		case "tv":
			return `the series ${match.title}, season ${match.season}`
		case "movie":
			return `the movie ${match.title} from ${match.year}`
		case "video":
			return `a video named ${match.title}`
		case "audio":
			return `music by ${match.artist}, from ${match.record}`
		case "unreadable":
			return match.key
	}
}
