/**
 * Text matching helpers shared by any feature that has to tell whether two
 * human written titles name the same thing, despite different punctuation,
 * casing, or spelling variants.
 */

/**
 * Latin letters whose diacritic is baked into the codepoint as a stroke or a
 * ligature, so NFD leaves them whole and the strip below would erase them.
 * Deliberately short: these are the ones that actually turn up in the titles
 * and artist names this matcher sees. It is a fold for comparison, not a
 * romanizer, so nothing outside the Latin alphabet belongs here.
 */
const STROKE_AND_LIGATURE_FOLDS: Record<string, string> = {
	ß: "ss",
	ø: "o",
	æ: "ae",
	œ: "oe",
	đ: "d",
	ł: "l",
}

/**
 * Lowercases, folds diacritics onto their base letters, and collapses
 * everything that is not a letter or digit into a single space, so
 * "Steins;Gate" and "Steins Gate", or "Me Dejé Llevar" and "Me Deje Llevar",
 * compare equal.
 */
export function normalize(text: string): string {
	// The fold has to happen before the strip, not after: the strip turns
	// anything outside [a-z0-9] into a space, so an accent left standing would
	// become a gap inside the word ("dejé" to "dej ") instead of folding into
	// the letter that carries it.
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Mn}+/gu, "")
		.replace(/[ßøæœđł]/g, (char) => STROKE_AND_LIGATURE_FOLDS[char] ?? char)
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

/**
 * Sorensen-Dice coefficient over character bigrams: twice the shared bigrams
 * divided by the total bigram count of both strings. Picked over an edit
 * distance like Levenshtein because it tolerates word order and small
 * insertions cheaply, which matters for titles that differ by a subtitle, a
 * romanization choice, or a reordered clause, not just a typo.
 */
export function diceSimilarity(a: string, b: string): number {
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
