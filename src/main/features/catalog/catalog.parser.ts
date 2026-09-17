import { filenameParse } from "@ctrl/video-filename-parser"
import type { ParsedVideo } from "./catalog.types"

type ParsedFilename = import("@ctrl/video-filename-parser").ParsedFilename
type ParsedShow = import("@ctrl/video-filename-parser").ParsedShow

const GROUP_TAG_PREFIX = /^\[[^\]]+\]/
const SEASON_EPISODE = /\bS\d{1,2}E\d{1,3}\b/i
const YEAR = /\b(19|20)\d{2}\b/
const LEADING_DASH = /^-\s*/
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/
const TRAILING_OPEN_BRACKET = /\s*[([{]\s*$/

// The library only reads S02 style seasons, so fansub markers stay glued to the
// title. Keep this narrow: the digits must carry a keyword or the S prefix, or a
// title that simply ends in a number (Mob Psycho 100, Steins;Gate 0, 86) loses it.
const TRAILING_SEASON =
	/\s+(?:(?:season|part)\s*(\d{1,2})|s(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+season)\s*$/i

function isParsedShow(parsed: ParsedFilename): parsed is ParsedShow {
	return "isTv" in parsed && parsed.isTv === true
}

function classifySignal(filename: string): ParsedVideo["signal"] {
	const hasGroupTag = GROUP_TAG_PREFIX.test(filename)
	const hasSeasonEpisode = SEASON_EPISODE.test(filename)
	if (hasGroupTag && hasSeasonEpisode) return "ambiguous"
	if (hasGroupTag) return "fansub"
	return "western"
}

// Only a marker at the very end is a season: in the middle it belongs to the
// title, as in "Made in Abyss Season 2 The Golden City".
function takeTrailingSeason(title: string): { season: number; title: string } | undefined {
	const match = title.match(TRAILING_SEASON)
	if (!match) return undefined

	const season = Number(match[1] ?? match[2] ?? match[3])
	const stripped = title.replace(TRAILING_SEASON, "").trim()
	if (!Number.isFinite(season) || stripped.length === 0) return undefined

	return { season, title: stripped }
}

function cleanTitle(raw: string): string {
	return (
		raw
			// The library stripped the release group itself up to 5.4.1 and stopped
			// doing it later, so relying on that put "[SubsPlease]" in a title the
			// moment the range resolved higher. Ours to remove, in one regex we own.
			.replace(GROUP_TAG_PREFIX, "")
			.trim()
			.replace(LEADING_DASH, "")
			.replace(TRAILING_PAREN, "")
			.replace(TRAILING_OPEN_BRACKET, "")
			.trim()
	)
}

// A movie mode parse of a fansub name can read a release hash as a year.
function toYear(raw: string | null | undefined): number | undefined {
	if (!raw) return undefined
	const value = Number(raw)
	return Number.isFinite(value) ? value : undefined
}

export function parse(filename: string): ParsedVideo {
	const signal = classifySignal(filename)
	const treatAsTv = signal === "fansub" || signal === "ambiguous" || SEASON_EPISODE.test(filename)

	let parsed = filenameParse(filename, treatAsTv)
	let season: number | undefined
	let episode: number | undefined
	let title = parsed.title ?? ""

	if (treatAsTv && isParsedShow(parsed)) {
		season = parsed.seasons?.[0]
		episode = parsed.episodeNumbers?.[0]
	}

	if (treatAsTv && season === undefined) {
		const bare = takeTrailingSeason(title)
		if (bare) {
			season = bare.season
			title = bare.title
		}
	}

	// A TV mode parse of a movie filename yields an empty title, so fall back to
	// movie mode whenever the TV attempt found neither a season nor an episode.
	if (episode === undefined && season === undefined && treatAsTv) {
		parsed = filenameParse(filename, false)
		title = parsed.title ?? ""
	}

	let year = toYear(parsed.year)

	if (year === undefined) {
		const yearMatch = filename.match(YEAR)
		if (yearMatch) {
			year = Number(yearMatch[0])
			title = title.replace(new RegExp(`\s*${yearMatch[0]}\s*$`), "")
		}
	}

	return { title: cleanTitle(title), season, episode, year, signal }
}
