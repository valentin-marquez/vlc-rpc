import { describe, expect, it } from "vitest"
import { diceSimilarity, normalize } from "./similarity"

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
