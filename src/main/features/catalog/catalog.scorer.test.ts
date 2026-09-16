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

	it("does not reject a year mismatch at the identity gate boundary either", () => {
		// These two spellings sit at a Dice similarity of 0.926, barely over the
		// gate. An exact title carries enough weight on its own to survive a year
		// mismatch, so only a boundary case can catch the year rejecting alone.
		const result = pickBest(parsed({ title: "Sword Art Online Alicisation", year: 2026 }), [
			candidate({ title: "Sword Art Online Alicization", aliases: [], year: 2019 }),
		])
		expect(result?.id).toBe("1")
	})

	it("lets nothing but the order of the list decide between equal candidates", () => {
		const first = candidate({ id: "a" })
		const second = candidate({ id: "b" })
		const input = parsed({ title: "Sora wa Akai Kawa no Hotori" })

		// Identical in every scored field, so the order of the list is the only
		// thing left that can decide the winner. Nothing about where a candidate
		// came from may tip it, which is what keeps a second provider from
		// needing a weight of its own.
		expect(pickBest(input, [first, second])?.id).toBe("a")
		expect(pickBest(input, [second, first])?.id).toBe("b")
	})
})

describe("pickBest, season as a signal between candidates", () => {
	// Real AniList entries for the query "Yoroi-Shinden Samurai Troopers".
	// AniList models each season as a separate entry with the season in the
	// title, so searching the title the parser stripped returns the whole
	// franchise at once.
	const samuraiTroopers = candidate({
		id: "194318",
		title: "Yoroi Shinden Samurai Troopers",
		aliases: ["Yoroi-Shinden Samurai Troopers"],
		year: 2026,
	})
	const samuraiTroopersPart2 = candidate({
		id: "209800",
		title: "Yoroi Shinden Samurai Troopers Part 2",
		aliases: ["Yoroi-Shinden Samurai Troopers Cour 2"],
		year: 2026,
	})

	it("picks the Part 2 entry when the file says season 2", () => {
		const file = parsed({ title: "Yoroi-Shinden Samurai Troopers", season: 2, episode: 3 })
		const result = pickBest(file, [samuraiTroopers, samuraiTroopersPart2])
		expect(result?.id).toBe("209800")
	})

	it("picks the first entry when the file says season 1", () => {
		const file = parsed({ title: "Yoroi-Shinden Samurai Troopers", season: 1, episode: 3 })
		const result = pickBest(file, [samuraiTroopers, samuraiTroopersPart2])
		expect(result?.id).toBe("194318")
	})

	it("picks the first entry when the file names no season", () => {
		const file = parsed({ title: "Yoroi-Shinden Samurai Troopers", episode: 3 })
		const result = pickBest(file, [samuraiTroopers, samuraiTroopersPart2])
		expect(result?.id).toBe("194318")
	})

	// The other real pair, for the query "Otome Game Sekai wa Mob ni Kibishii
	// Sekai desu" (non latin synonyms left out). On raw titles the season 1
	// entry matches the query exactly and the season 2 entry only at 0.978, so
	// title similarity alone always handed this one to the wrong season.
	const otomege = candidate({
		id: "142074",
		title: "Otomege Sekai wa Mob ni Kibishii Sekai desu",
		aliases: [
			"Trapped in a Dating Sim: The World of Otome Games Is Tough for Mobs",
			"Otome Game Sekai wa Mob ni Kibishii Sekai desu",
		],
		year: 2022,
	})
	const otomege2 = candidate({
		id: "159309",
		title: "Otomege Sekai wa Mob ni Kibishii Sekai desu 2",
		aliases: [
			"Trapped in a Dating Sim: The World of Otome Games is Tough for Mobs Season 2",
			"Otome Game Sekai wa Mob ni Kibishii Sekai desu 2",
			"Otomege 2",
		],
		year: 2026,
	})

	it("prefers the season the file names over a higher raw title similarity", () => {
		const file = parsed({
			title: "Otome Game Sekai wa Mob ni Kibishii Sekai desu",
			season: 2,
			episode: 1,
		})
		const result = pickBest(file, [otomege, otomege2])
		expect(result?.id).toBe("159309")
	})

	it("leaves the exact title match winning when the file says season 1", () => {
		const file = parsed({
			title: "Otome Game Sekai wa Mob ni Kibishii Sekai desu",
			season: 1,
			episode: 1,
		})
		const result = pickBest(file, [otomege, otomege2])
		expect(result?.id).toBe("142074")
	})

	it("outranks the widest title gap the gate can admit", () => {
		// 1.0 against 0.926 is close to the widest gap two survivors can have,
		// and the season still decides: 0.08 of similarity is worth 0.032 of
		// score, a season that agrees is worth 0.105.
		const exact = candidate({ id: "exact", title: "Sword Art Online Alicization", aliases: [] })
		const sequel = candidate({
			id: "sequel",
			title: "Sword Art Online Alicisation II",
			aliases: [],
		})
		const file = parsed({ title: "Sword Art Online Alicization", season: 2, episode: 6 })

		expect(pickBest(file, [exact, sequel])?.id).toBe("sequel")
	})

	it("resolves a franchise with a single candidate exactly as before", () => {
		const file = parsed({ title: "Sora wa Akai Kawa no Hotori", season: 2, episode: 7 })
		const result = pickBest(file, [candidate()])
		expect(result?.id).toBe("1")
	})

	it("does not let the season reject the only survivor there is", () => {
		// The second entry alone, for a file that names no season: it passes the
		// gate on its own synonym, its year is off by six, nothing parsed says tv
		// or movie, and its marker contradicts the file. 1.0*0.4 + 0.2*0.25 +
		// 0.5*0.2 + 0.3*0.15 = 0.595, over the threshold, same invariant the year
		// already had.
		const file = parsed({ title: "Otome Game Sekai wa Mob ni Kibishii Sekai desu", year: 2020 })
		expect(pickBest(file, [otomege2])?.id).toBe("159309")
	})

	it("keeps rejecting a sequel entry of a season the file does not name", () => {
		// Only its marker free form reaches the gate, and that marker disagrees,
		// so this resolves to nothing, exactly as it did before seasons ranked.
		const overlordIII = candidate({ id: "ol3", title: "Overlord III", aliases: [] })
		expect(pickBest(parsed({ title: "Overlord", season: 2, episode: 4 }), [overlordIII])).toBeNull()
		expect(pickBest(parsed({ title: "Overlord", episode: 4 }), [overlordIII])).toBeNull()
	})
})

describe("pickBest, season markers in candidate titles", () => {
	const first = candidate({ id: "first", title: "Kaguya-sama wa Kokurasetai", aliases: [] })

	it.each([
		["Season N", "Kaguya-sama wa Kokurasetai Season 2"],
		["Part N", "Kaguya-sama wa Kokurasetai Part 2"],
		["Nth Season", "Kaguya-sama wa Kokurasetai 2nd Season"],
		["a bare trailing number", "Kaguya-sama wa Kokurasetai 2"],
		["a roman numeral", "Kaguya-sama wa Kokurasetai II"],
	])("reads %s as the season of a candidate", (_form, sequelTitle) => {
		const sequel = candidate({ id: "sequel", title: sequelTitle, aliases: [] })
		const secondSeason = parsed({ title: "Kaguya-sama wa Kokurasetai", season: 2, episode: 4 })
		const firstSeason = parsed({ title: "Kaguya-sama wa Kokurasetai", season: 1, episode: 4 })

		expect(pickBest(secondSeason, [first, sequel])?.id).toBe("sequel")
		expect(pickBest(firstSeason, [first, sequel])?.id).toBe("first")
	})

	it("reads the season out of an alias too", () => {
		const sequel = candidate({
			id: "sequel",
			title: "Kaguya-sama: Love is War",
			aliases: ["Kaguya-sama wa Kokurasetai Season 2"],
		})
		const file = parsed({ title: "Kaguya-sama wa Kokurasetai", season: 2, episode: 4 })
		expect(pickBest(file, [first, sequel])?.id).toBe("sequel")
	})

	it("tells apart the entries of a franchise numbered with roman numerals", () => {
		const overlord = candidate({ id: "ol", title: "Overlord", aliases: [], year: 2015 })
		const overlordII = candidate({ id: "ol2", title: "Overlord II", aliases: [], year: 2018 })
		const overlordIII = candidate({ id: "ol3", title: "Overlord III", aliases: [], year: 2018 })
		const lineup = [overlord, overlordII, overlordIII]

		expect(pickBest(parsed({ title: "Overlord", season: 3, episode: 2 }), lineup)?.id).toBe("ol3")
		expect(pickBest(parsed({ title: "Overlord", season: 2, episode: 2 }), lineup)?.id).toBe("ol2")
		expect(pickBest(parsed({ title: "Overlord", season: 1, episode: 2 }), lineup)?.id).toBe("ol")
	})

	it("does not read a number that belongs to the title as a season", () => {
		// Reading "100" as a marker would leave "Mob Psycho" as the candidate's
		// identity and let it through the gate against a different show.
		const result = pickBest(parsed({ title: "Mob Psycho", season: 2, episode: 4 }), [
			candidate({ title: "Mob Psycho 100", aliases: [] }),
		])
		expect(result).toBeNull()
	})

	it("does not let a matching season marker admit a title the gate rejects", () => {
		const result = pickBest(parsed({ title: "The Last of Us", season: 2, episode: 4 }), [
			candidate({ title: "The Last Airbender Season 2", aliases: [] }),
		])
		expect(result).toBeNull()
	})
})
