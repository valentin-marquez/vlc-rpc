import { describe, expect, it } from "vitest"
import { diceSimilarity, normalize } from "./similarity"

// The threshold the catalog scorer gates identity on. Repeated here rather than
// imported so that a feature cannot loosen the number these tests measure
// against by loosening its own gate.
const IDENTITY_GATE = 0.92

describe("normalize", () => {
	it("lowercases and strips punctuation", () => {
		expect(normalize("Steins;Gate")).toBe("steins gate")
	})

	it("collapses runs of punctuation and whitespace into one space", () => {
		expect(normalize("Hello,,,   World!!!")).toBe("hello world")
	})

	it("trims the result", () => {
		expect(normalize("  Trailing Spaces  ")).toBe("trailing spaces")
	})

	it("returns an empty string for an empty input", () => {
		expect(normalize("")).toBe("")
	})

	it("folds an accent onto its base letter instead of leaving a gap", () => {
		expect(normalize("Me Dejé Llevar")).toBe("me deje llevar")
		expect(normalize("Corazón")).toBe("corazon")
		expect(normalize("Björk")).toBe("bjork")
	})

	it.each([
		["ß", "Straße", "strasse"],
		["ø", "Blue Øyster Cult", "blue oyster cult"],
		["æ", "Æther", "aether"],
		["œ", "Cœur de Pirate", "coeur de pirate"],
		["đ", "Đorđe", "dorde"],
		["ł", "Łukasz", "lukasz"],
	])("folds %s, which decomposition leaves whole", (_letter, input, expected) => {
		expect(normalize(input)).toBe(expected)
	})

	it("leaves plain ASCII exactly as it was before the fold existed", () => {
		// The catalog gate is calibrated against measured similarities of real,
		// ASCII anime titles. The fold must not move any of them, so it has to be
		// a no-op on input that carries no accent.
		const ascii = "Steins;Gate 0, Mob Psycho 100 (2nd Season) [1080p]"
		expect(normalize(ascii)).toBe(
			ascii
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, " ")
				.trim(),
		)
	})
})

describe("diceSimilarity", () => {
	it("scores identical strings at 1.0", () => {
		expect(diceSimilarity("steins gate", "steins gate")).toBe(1)
	})

	it("scores two spellings that normalize to the same thing at 1.0", () => {
		const a = normalize("Steins;Gate")
		const b = normalize("Steins Gate")
		expect(diceSimilarity(a, b)).toBe(1)
	})

	it("scores clearly different strings low", () => {
		expect(diceSimilarity("steins gate", "cowboy bebop")).toBeLessThan(0.3)
	})

	it("scores an empty string against anything as 0", () => {
		expect(diceSimilarity("", "steins gate")).toBe(0)
	})

	it("scores two empty strings as 1, since bigrams() treats a short string as its own single token", () => {
		// bigrams("") returns [""] rather than [], because the length check
		// that exists to keep single character strings comparable also catches
		// the empty string: it never reaches the early "no bigrams" return, and
		// the two identical single element lists match completely. This pins
		// the current behaviour, which is arguably surprising, rather than
		// changing it.
		expect(diceSimilarity("", "")).toBe(1)
	})
})

describe("diceSimilarity over normalized accented titles", () => {
	// Every one of these used to score below the gate (0.880, 0.778, 0.667 and
	// 0.500 respectively) because the old normalize() replaced the accented
	// letter with a space instead of folding it, so a correct identification was
	// silently refused whenever the file and the catalog disagreed on accents.
	it.each([
		["Me Dejé Llevar", "Me Deje Llevar"],
		["Adiós Amor", "Adios Amor"],
		["Corazón", "Corazon"],
		["Björk", "Bjork"],
	])("admits %s against %s at the identity gate", (accented, plain) => {
		expect(diceSimilarity(normalize(accented), normalize(plain))).toBeGreaterThanOrEqual(
			IDENTITY_GATE,
		)
	})

	it("keeps two genuinely different words apart", () => {
		// The old normalize() truncated both of these to "mam", scoring them 1.0
		// and merging two different words. Keeping the base letter is what tells
		// them apart, so the fold narrows this failure rather than widening it.
		expect(diceSimilarity(normalize("Mamá"), normalize("Mamé"))).toBeLessThan(IDENTITY_GATE)
		expect(diceSimilarity(normalize("Corazón"), normalize("Corazones"))).toBeLessThan(IDENTITY_GATE)
		expect(diceSimilarity(normalize("Björk"), normalize("Bjarki"))).toBeLessThan(IDENTITY_GATE)
	})
})
