import { diceSimilarity, normalize } from "@main/core/similarity"
import type { Candidate, ParsedVideo } from "./catalog.types"

const IDENTITY_GATE_THRESHOLD = 0.92

const TITLE_WEIGHT = 0.4
const YEAR_WEIGHT = 0.25
const MEDIA_KIND_WEIGHT = 0.2
const SEASON_WEIGHT = 0.15

const SEASON_MISMATCH_SCORE = 0.3

/**
 * The worst a gate survivor can score is 0.92 * 0.4 + 0.2 * 0.25 + 0.5 * 0.2 +
 * 0.3 * 0.15 = 0.563: a title right at the gate, a year off by two or more,
 * nothing parsed to check the media kind against, and a season that disagrees.
 * Staying under that is what keeps the year, or the season, from rejecting on
 * its own a candidate the identity gate accepted.
 */
const SCORE_THRESHOLD = 0.55

const ROMAN_SEASONS: Record<string, number> = {
	ii: 2,
	iii: 3,
	iv: 4,
	vi: 6,
	vii: 7,
	viii: 8,
	ix: 9,
}

// Read off an already normalized name, so punctuation is gone and every space is
// a single one. A bare number counts only as a single digit above one: "Mob
// Psycho 100" and "Steins;Gate 0" end in numbers that belong to the title. The
// one letter numerals (i, v, x) are left out for the same reason: a title that
// ends in one of those is far more often a word than a season.
const NUMERIC_SEASON_MARKERS = [
	/ (?:season|part|cour) (\d{1,2})$/,
	/ (\d{1,2})(?:st|nd|rd|th) season$/,
	/ ([2-9])$/,
]
const ROMAN_SEASON_MARKER = / (ii|iii|iv|vi|vii|viii|ix)$/

interface SeasonMarker {
	season: number
	base: string
}

interface Identity {
	season: number
	names: string[]
	baseNames: string[]
}

function readSeasonMarker(normalized: string): SeasonMarker | undefined {
	for (const pattern of NUMERIC_SEASON_MARKERS) {
		const match = normalized.match(pattern)
		const base = match?.index === undefined ? "" : normalized.slice(0, match.index)
		if (match?.[1] !== undefined && base.length > 0) {
			return { season: Number(match[1]), base }
		}
	}

	const roman = normalized.match(ROMAN_SEASON_MARKER)
	if (roman?.index === undefined || roman[1] === undefined) return undefined
	const season = ROMAN_SEASONS[roman[1]]
	const base = normalized.slice(0, roman.index)
	if (season === undefined || base.length === 0) return undefined

	return { season, base }
}

/**
 * Catalogs model each season as its own entry with the season in the title, so
 * the marker is read out of the names and kept aside as a signal. An entry that
 * carries no marker is season 1 by convention. The marker free form of each name
 * is kept apart because the parser already strips the marker off the filename:
 * compared as they come, a sequel reads as a different work.
 */
function identityOf(candidate: Candidate): Identity {
	let season = 1
	const names: string[] = []
	const baseNames: string[] = []

	for (const name of [candidate.title, ...candidate.aliases]) {
		const normalized = normalize(name)
		names.push(normalized)

		const marker = readSeasonMarker(normalized)
		if (!marker) continue
		season = Math.max(season, marker.season)
		baseNames.push(marker.base)
	}

	return { season, names, baseNames }
}

function bestSimilarity(target: string, names: string[]): number {
	let best = 0
	for (const name of names) {
		best = Math.max(best, diceSimilarity(target, name))
	}
	return best
}

function isHardExcluded(parsed: ParsedVideo, candidate: Candidate): boolean {
	const hasEpisodeInfo = parsed.season !== undefined || parsed.episode !== undefined
	return candidate.mediaKind === "movie" && hasEpisodeInfo
}

function yearScore(parsed: ParsedVideo, candidate: Candidate): number {
	if (parsed.year === undefined || candidate.year === undefined) return 0.5
	const diff = Math.abs(parsed.year - candidate.year)
	if (diff === 0) return 1
	if (diff === 1) return 0.8
	// Small rather than zero: a distant year must be able to lose a ranking
	// without being able to reject the only candidate there is.
	return 0.2
}

function mediaKindScore(parsed: ParsedVideo, candidate: Candidate): number {
	const hasEpisodeInfo = parsed.season !== undefined || parsed.episode !== undefined
	if (!hasEpisodeInfo) return 0.5
	return candidate.mediaKind === "tv" ? 1 : 0
}

export function pickBest(parsed: ParsedVideo, candidates: Candidate[]): Candidate | null {
	const target = normalize(parsed.title)
	// A file that names no season is playing season 1: that is the convention
	// the catalogs themselves follow when they leave the marker off an entry.
	const expectedSeason = parsed.season ?? 1

	let best: Candidate | null = null
	let bestScore = -1

	for (const candidate of candidates) {
		if (isHardExcluded(parsed, candidate)) continue

		const identity = identityOf(candidate)
		const seasonMatches = identity.season === expectedSeason
		const nameSimilarity = bestSimilarity(target, identity.names)
		const baseSimilarity = bestSimilarity(target, identity.baseNames)

		// The gate is the same rule it has always been, plus one door: an entry
		// whose title is the parsed one once its own season marker is read off,
		// and whose marker is the season the file names. Without it the sequel
		// entry of a franchise cannot even be ranked, since the marker it carries
		// and the parser strips costs it more similarity than the gate allows.
		const passesGate =
			nameSimilarity >= IDENTITY_GATE_THRESHOLD ||
			(seasonMatches && baseSimilarity >= IDENTITY_GATE_THRESHOLD)
		if (!passesGate) continue

		const candidateScore =
			Math.max(nameSimilarity, baseSimilarity) * TITLE_WEIGHT +
			yearScore(parsed, candidate) * YEAR_WEIGHT +
			mediaKindScore(parsed, candidate) * MEDIA_KIND_WEIGHT +
			(seasonMatches ? 1 : SEASON_MISMATCH_SCORE) * SEASON_WEIGHT

		if (candidateScore > bestScore) {
			bestScore = candidateScore
			best = candidate
		}
	}

	return bestScore >= SCORE_THRESHOLD ? best : null
}
