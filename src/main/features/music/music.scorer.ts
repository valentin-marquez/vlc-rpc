import { diceSimilarity, normalize } from "@main/core/similarity"
import type { RecordingCandidate, TrackQuery } from "./music.types"

const IDENTITY_GATE_THRESHOLD = 0.92

const CREDIT_WEIGHT = 0.5
const TITLE_WEIGHT = 0.3
const ALBUM_WEIGHT = 0.2

/**
 * The credited artist is there, but the candidate credits someone else too.
 * Kept far below 1 on purpose: searching a track returns the solo take and the
 * collaborations together, all sharing the title and the lead artist, so every
 * other signal ties and the shape of the credit is the only discriminator left.
 * The gap it opens, 0.6 * 0.5 = 0.3, has to outweigh everything the rest can
 * still move: 0.08 * 0.3 of title (the widest gap the gate admits) plus 0.5 *
 * 0.2 of album, 0.124 together. A tag naming one artist is evidence that the
 * solo version is what is playing, and the collaboration's single carries
 * different artwork.
 */
const SHARED_CREDIT_SCORE = 0.4

/**
 * Neutral, never 0. User tags are wrong often: the repo's own VLC fixture
 * claims album "Ahora" for a recording that belongs to "Me Dejé Llevar". A
 * mismatched album that punished would push that correct identification under
 * the threshold and resolve the file to no cover at all.
 */
const NEUTRAL_ALBUM_SCORE = 0.5

/**
 * The worst a gate survivor can score is 0.4 * 0.5 + 0.92 * 0.3 + 0.5 * 0.2 =
 * 0.576: a title right at the gate, a credit with collaborators the tag does
 * not name, and an album tag matching nothing. Staying under that is what keeps
 * any single signal from rejecting on its own a candidate the identity gate
 * accepted. The gate is the filter, this threshold only orders.
 */
const SCORE_THRESHOLD = 0.55

/** Both sides already normalized. */
function matches(a: string, b: string): boolean {
	return a === b || diceSimilarity(a, b) >= IDENTITY_GATE_THRESHOLD
}

/**
 * Whether a release names the same edition as the file's album tag. Fuzzy,
 * not exact, and on purpose: user tags carry "(Deluxe)" and "(Remaster)"
 * suffixes constantly, and this is the one answer both the scorer and the
 * resolver use, so a candidate cannot win a match here and then have the
 * resolver refuse to prefer that same release for artwork.
 */
export function albumMatches(album: string, releaseTitle: string): boolean {
	const wanted = normalize(album)
	if (wanted.length === 0) return false
	return matches(wanted, normalize(releaseTitle))
}

function normalizedNames(names: string[]): string[] {
	const unique = new Set<string>()
	for (const name of names) {
		const normalized = normalize(name)
		if (normalized.length > 0) unique.add(normalized)
	}
	return [...unique]
}

/**
 * The whole credit as one string. Neither side is split on punctuation, so the
 * same credit arrives in two shapes: iTunes answers "Lady Gaga & Bradley
 * Cooper" as one name where MusicBrainz lists the two, and the artist tag can
 * be written either way. Joined, both shapes compare equal.
 */
function creditedAsWhole(wanted: string[], credited: string[]): boolean {
	return matches(wanted.join(" "), credited.join(" "))
}

/**
 * Two different songs share a title constantly, so the performer is what tells
 * them apart. Both comparisons are needed: "AC/DC" and "Lady Gaga & Bradley
 * Cooper" only match whole, while a tag naming one artist matches a
 * collaboration through a single credited name, in any position.
 */
function isCredited(wanted: string[], credited: string[]): boolean {
	if (creditedAsWhole(wanted, credited)) return true
	return wanted.some((name) => credited.some((other) => matches(name, other)))
}

function creditScore(wanted: string[], credited: string[]): number {
	// The same fuzzy rule the gate uses. With strict equality a candidate spelled
	// slightly differently scored as a collaboration the tag does not name, and
	// the solo and the collaboration both landed on the floor, leaving the rank
	// to decide which cover the user sees.
	const isSameCredit =
		creditedAsWhole(wanted, credited) ||
		(wanted.length === credited.length &&
			wanted.every((name) => credited.some((other) => matches(name, other))))
	return isSameCredit ? 1 : SHARED_CREDIT_SCORE
}

function albumScore(album: string | undefined, candidate: RecordingCandidate): number {
	const matched = candidate.releases.some((release) => albumMatches(album ?? "", release.title))
	return matched ? 1 : NEUTRAL_ALBUM_SCORE
}

export function pickBest(
	query: TrackQuery,
	candidates: RecordingCandidate[],
): RecordingCandidate | null {
	const wantedArtists = normalizedNames(query.artists)
	const wantedTitle = normalize(query.title)

	let best: RecordingCandidate | null = null
	let bestScore = -1

	for (const candidate of candidates) {
		const creditedArtists = normalizedNames(candidate.artists)
		if (!isCredited(wantedArtists, creditedArtists)) continue

		const candidateTitle = normalize(candidate.title)
		if (!matches(wantedTitle, candidateTitle)) continue

		const score =
			creditScore(wantedArtists, creditedArtists) * CREDIT_WEIGHT +
			diceSimilarity(wantedTitle, candidateTitle) * TITLE_WEIGHT +
			albumScore(query.album, candidate) * ALBUM_WEIGHT

		// An exact tie goes to the lower rank, otherwise the arbitrary order the
		// provider returned decides which cover the user sees.
		const wins =
			best === null || score > bestScore || (score === bestScore && candidate.rank < best.rank)
		if (wins) {
			bestScore = score
			best = candidate
		}
	}

	return bestScore >= SCORE_THRESHOLD ? best : null
}
