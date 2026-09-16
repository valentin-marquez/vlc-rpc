import type { Candidate, ParsedVideo } from "./catalog.types"

const IDENTITY_GATE_THRESHOLD = 0.92

/**
 * The worst a gate survivor can score is 0.92 * 0.45 + 0.2 * 0.30 + 0.5 * 0.25 =
 * 0.599: a title right at the gate, a year off by two or more, and nothing
 * parsed to check the media kind against. Staying under that is what keeps the
 * year from rejecting, on its own, a candidate the identity gate accepted.
 */
const SCORE_THRESHOLD = 0.55

function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function bigrams(text: string): string[] {
	if (text.length < 2) return [text]
	const grams: string[] = []
	for (let i = 0; i < text.length - 1; i++) {
		grams.push(text.slice(i, i + 2))
	}
	return grams
}

function diceSimilarity(a: string, b: string): number {
	const gramsA = bigrams(a)
	const gramsB = bigrams(b)
	if (gramsA.length === 0 || gramsB.length === 0) return 0

	const counts = new Map<string, number>()
	for (const gram of gramsA) {
		counts.set(gram, (counts.get(gram) ?? 0) + 1)
	}

	let matches = 0
	for (const gram of gramsB) {
		const remaining = counts.get(gram) ?? 0
		if (remaining > 0) {
			matches++
			counts.set(gram, remaining - 1)
		}
	}

	return (2 * matches) / (gramsA.length + gramsB.length)
}

function bestTitleSimilarity(parsed: ParsedVideo, candidate: Candidate): number {
	const target = normalize(parsed.title)
	const names = [candidate.title, ...candidate.aliases]
	return Math.max(...names.map((name) => diceSimilarity(target, normalize(name))))
}

function isHardExcluded(parsed: ParsedVideo, candidate: Candidate): boolean {
	const hasEpisodeInfo = parsed.season !== undefined || parsed.episode !== undefined
	return candidate.mediaKind === "movie" && hasEpisodeInfo
}

function passesIdentityGate(parsed: ParsedVideo, candidate: Candidate): boolean {
	return bestTitleSimilarity(parsed, candidate) >= IDENTITY_GATE_THRESHOLD
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

function score(parsed: ParsedVideo, candidate: Candidate): number {
	return (
		bestTitleSimilarity(parsed, candidate) * 0.45 +
		yearScore(parsed, candidate) * 0.3 +
		mediaKindScore(parsed, candidate) * 0.25
	)
}

export function pickBest(parsed: ParsedVideo, candidates: Candidate[]): Candidate | null {
	const survivors = candidates.filter(
		(candidate) => !isHardExcluded(parsed, candidate) && passesIdentityGate(parsed, candidate),
	)
	if (survivors.length === 0) return null

	let best: Candidate | null = null
	let bestScore = -1
	for (const candidate of survivors) {
		const candidateScore = score(parsed, candidate)
		if (candidateScore > bestScore) {
			bestScore = candidateScore
			best = candidate
		}
	}

	return bestScore >= SCORE_THRESHOLD ? best : null
}
