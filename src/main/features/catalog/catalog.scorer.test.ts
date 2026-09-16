import { describe, expect, it } from "vitest"
import { pickBest } from "./catalog.scorer"
import type { Candidate, ParsedVideo } from "./catalog.types"

function parsed(overrides: Partial<ParsedVideo> = {}): ParsedVideo {
	return { title: "Sora wa Akai Kawa no Hotori", signal: "fansub", ...overrides }
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		provider: "anilist",
		id: "1",
		title: "Sora wa Akai Kawa no Hotori",
		aliases: ["Red River"],
		mediaKind: "tv",
		posterUrl: "https://example.com/poster.jpg",
		...overrides,
	}
}

describe("pickBest, identity gate", () => {
	it("picks an exact title match", () => {
		const result = pickBest(parsed(), [candidate()])
		expect(result?.id).toBe("1")
	})

	it("picks a match against an alias, not just the primary title", () => {
		const result = pickBest(parsed({ title: "Red River" }), [candidate()])
		expect(result?.id).toBe("1")
	})

	it("tolerates punctuation differences", () => {
		const result = pickBest(parsed({ title: "Steins Gate" }), [
			candidate({ title: "Steins;Gate", aliases: [] }),
		])
		expect(result?.id).toBe("1")
	})

	it("never lets a merely similar title cross the threshold", () => {
		const result = pickBest(parsed({ title: "The Last of Us" }), [
			candidate({ title: "The Last Airbender", aliases: [] }),
		])
		expect(result).toBeNull()
	})

	it("returns null when no candidate passes the gate", () => {
		const result = pickBest(parsed({ title: "Completely Unrelated Show" }), [candidate()])
		expect(result).toBeNull()
	})
})

describe("pickBest, hard exclusion", () => {
	it("excludes a movie candidate when the parser found season or episode", () => {
		const result = pickBest(parsed({ title: "Some Movie", season: 1, episode: 3 }), [
			candidate({ title: "Some Movie", aliases: [], mediaKind: "movie" }),
		])
		expect(result).toBeNull()
	})
})

describe("pickBest, weighted signals among gate survivors", () => {
	it("prefers the candidate whose year matches when both pass the identity gate", () => {
		const closeYear = candidate({ id: "close", title: "Remake Show", aliases: [], year: 2020 })
		const farYear = candidate({ id: "far", title: "Remake Show", aliases: [], year: 1998 })
		const result = pickBest(parsed({ title: "Remake Show", year: 2020 }), [farYear, closeYear])
		expect(result?.id).toBe("close")
	})

	it("does not reject a candidate purely for a year mismatch", () => {
		const result = pickBest(parsed({ title: "Sora wa Akai Kawa no Hotori", year: 2020 }), [
			candidate({ year: 1994 }),
		])
		expect(result?.id).toBe("1")
	})

	it("does not let the provider of origin affect the outcome", () => {
		const anilistCandidate = candidate({ id: "a", provider: "anilist" })
		const tmdbCandidate = candidate({ id: "t", provider: "tmdb", year: 2026 })
		const result = pickBest(parsed({ title: "Sora wa Akai Kawa no Hotori", year: 2026 }), [
			anilistCandidate,
			tmdbCandidate,
		])
		expect(result?.id).toBe("t")
	})
})
