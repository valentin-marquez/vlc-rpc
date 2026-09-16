import { filenameParse } from "@ctrl/video-filename-parser"
import type { ParsedVideo } from "./catalog.types"

type ParsedFilename = import("@ctrl/video-filename-parser").ParsedFilename
type ParsedShow = import("@ctrl/video-filename-parser").ParsedShow

const GROUP_TAG_PREFIX = /^\[[^\]]+\]/
const SEASON_EPISODE = /\bS\d{1,2}E\d{1,3}\b/i
const YEAR = /\b(19|20)\d{2}\b/
const LEADING_DASH = /^-\s*/
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/

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

function cleanTitle(raw: string): string {
	return raw.replace(LEADING_DASH, "").replace(TRAILING_PAREN, "").trim()
}

export function parse(filename: string): ParsedVideo {
	const signal = classifySignal(filename)
	const treatAsTv = signal === "fansub" || signal === "ambiguous" || SEASON_EPISODE.test(filename)

	let parsed = filenameParse(filename, treatAsTv)
	let season: number | undefined
	let episode: number | undefined

	if (treatAsTv && isParsedShow(parsed)) {
		season = parsed.seasons?.[0]
		episode = parsed.episodeNumbers?.[0]
	}

	if (episode === undefined && !treatAsTv) {
		parsed = filenameParse(filename, false)
	}

	let title = parsed.title ?? ""
	let year = parsed.year ? Number(parsed.year) : undefined

	if (year === undefined) {
		const yearMatch = filename.match(YEAR)
		if (yearMatch) {
			year = Number(yearMatch[0])
			title = title.replace(new RegExp(`\s*${yearMatch[0]}\s*$`), "")
		}
	}

	return { title: cleanTitle(title), season, episode, year, signal }
}
