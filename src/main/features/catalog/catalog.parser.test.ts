import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parse } from "./catalog.parser"

function corpus(): string[] {
	const raw = readFileSync(join(__dirname, "__fixtures__", "anime-filenames.json"), "utf-8")
	return JSON.parse(raw)
}

describe("parse, fansub naming", () => {
	it("extracts title and absolute episode from a SubsPlease release", () => {
		const result = parse("[SubsPlease] Sora wa Akai Kawa no Hotori - 11 (1080p) [0D37EB83].mkv")
		expect(result.title).toBe("Sora wa Akai Kawa no Hotori")
		expect(result.season).toBeUndefined()
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("fansub")
	})

	it("reads a Part suffix on a hyphenated title as the season", () => {
		const result = parse(
			"[Erai-raws] Yoroi-Shinden Samurai Troopers Part 2 - 11 [1080p CR WEBRip HEVC AAC][MultiSub][12E44D90]",
		)
		expect(result.title).toBe("Yoroi-Shinden Samurai Troopers")
		expect(result.season).toBe(2)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("fansub")
	})

	it("strips a leading dash left over from a group tag followed by its own separator", () => {
		const result = parse("[Doomdos] - Lingwu Continent - 215 [2160p IQ WEB-DL]")
		expect(result.title).toBe("Lingwu Continent")
		expect(result.episode).toBe(215)
		expect(result.signal).toBe("fansub")
	})

	it("keeps the clean TV-mode title and season when a filename has season but no episode", () => {
		const result = parse("[Group] Show S02 [1080p].mkv")
		expect(result.title).toBe("Show")
		expect(result.season).toBe(2)
		expect(result.episode).toBeUndefined()
		expect(result.signal).toBe("fansub")
	})
})

describe("parse, bare season markers the library does not read", () => {
	it("reads a bare S2 suffix as the season", () => {
		const result = parse(
			"[ASW] Otome Game Sekai wa Mob ni Kibishii Sekai desu S2 - 11 [1080p HEVC x265 10Bit][AAC]",
		)
		expect(result.title).toBe("Otome Game Sekai wa Mob ni Kibishii Sekai desu")
		expect(result.season).toBe(2)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("fansub")
	})

	it("reads a spelled out Season suffix as the season", () => {
		const result = parse(
			"[Doomdos] - Skeleton Knight in Another World Season 2 - 11 [2160p IQ WEB-DL]",
		)
		expect(result.title).toBe("Skeleton Knight in Another World")
		expect(result.season).toBe(2)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("fansub")
	})

	it("reads an ordinal 2nd Season suffix as the season", () => {
		const result = parse(
			"[SubsPlease] Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season - 05 (1080p) [ABCD1234].mkv",
		)
		expect(result.title).toBe("ReZero kara Hajimeru Isekai Seikatsu")
		expect(result.season).toBe(2)
		expect(result.episode).toBe(5)
		expect(result.signal).toBe("fansub")
	})

	it("never eats a trailing number that belongs to the title", () => {
		const result = parse("[SubsPlease] Mob Psycho 100 - 11 (1080p) [ABCD1234].mkv")
		expect(result.title).toBe("Mob Psycho 100")
		expect(result.season).toBeUndefined()
		expect(result.episode).toBe(11)
	})

	it("leaves a season word that sits in the middle of the title alone", () => {
		const result = parse("[Erai-raws] Made in Abyss Season 2 The Golden City - 11 [1080p]")
		expect(result.title).toBe("Made in Abyss Season 2 The Golden City")
		expect(result.season).toBeUndefined()
		expect(result.episode).toBe(11)
	})
})

describe("parse, fansub naming of movies", () => {
	it("falls back to a movie parse when the TV attempt found no episode", () => {
		const result = parse("[EMBER] Suzume no Tojimari (2022) [BDRip 1080p HEVC].mkv")
		expect(result.title).toBe("Suzume no Tojimari")
		expect(result.year).toBe(2022)
		expect(result.season).toBeUndefined()
		expect(result.episode).toBeUndefined()
		expect(result.signal).toBe("fansub")
	})

	it("drops the dangling parenthesis a movie parse leaves behind", () => {
		const result = parse("[SubsPlease] Demon Slayer Movie - Infinity Castle (1080p) [ABCD1234].mkv")
		expect(result.title).toBe("Demon Slayer Movie - Infinity Castle")
		expect(result.episode).toBeUndefined()
		expect(result.signal).toBe("fansub")
	})

	it("never reads a release hash as a year", () => {
		const result = parse("[SubsPlease] Demon Slayer Movie - Infinity Castle (1080p) [ABCD1234].mkv")
		expect(result.year).toBeUndefined()

		for (const filename of corpus()) {
			const { year } = parse(filename)
			expect(year === undefined || Number.isFinite(year)).toBe(true)
		}
	})
})

describe("parse, ambiguous naming, group tag plus season/episode", () => {
	it("classifies a bracketed group using S/E numbering as ambiguous, not fansub", () => {
		const result = parse(
			"[ToonsHub] KAMUI Hes Behind You S00E11 1080p AMZN WEB-DL DDP2.0 H.264 (Multi-Subs)",
		)
		expect(result.title).toBe("KAMUI Hes Behind You")
		expect(result.season).toBe(0)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("ambiguous")
	})

	it("strips a trailing English translation in parens from the title", () => {
		const result = parse(
			"[Judas] Kimi ga Shinu made Koi o Shitai (I Want to Love You Till Your Dying Day) - S01E11 [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)",
		)
		expect(result.title).toBe("Kimi ga Shinu made Koi o Shitai")
		expect(result.season).toBe(1)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("ambiguous")
	})

	it("keeps the season the library found, even next to a trailing season word", () => {
		const result = parse(
			"[AnoZu] Yoroi-Shinden Samurai Troopers S01E23 1080p CR WEB-DL AAC 2.0 H.264 | Yoroi Shin Den Samurai Troopers Part 2",
		)
		expect(result.title).toBe("Yoroi-Shinden Samurai Troopers")
		expect(result.season).toBe(1)
		expect(result.episode).toBe(23)
	})
})

describe("parse, western naming, no group tag", () => {
	it("classifies a plain S/E filename as western", () => {
		const result = parse("Some.Show.S01E03.1080p.WEB-DL.mp4")
		expect(result.title).toBe("Some Show")
		expect(result.season).toBe(1)
		expect(result.episode).toBe(3)
		expect(result.signal).toBe("western")
	})

	it("extracts a year that sits right before the S/E marker, and strips it from the title", () => {
		const result = parse(
			"Red River 2026 S01E11 Where My Heart Is 1080p CR WEB-DL AAC2.0 H.264-VARYG (Multi-Subs)",
		)
		expect(result.title).toBe("Red River")
		expect(result.year).toBe(2026)
		expect(result.season).toBe(1)
		expect(result.episode).toBe(11)
		expect(result.signal).toBe("western")
	})

	it("parses a plain movie filename with no season or episode", () => {
		const result = parse("The.Matrix.1999.1080p.BluRay.x264.mp4")
		expect(result.title).toBe("The Matrix")
		expect(result.year).toBe(1999)
		expect(result.season).toBeUndefined()
		expect(result.episode).toBeUndefined()
		expect(result.signal).toBe("western")
	})
})

describe("parse, real corpus from nyaa.si", () => {
	it("never throws and always returns a non-empty title for every captured filename", () => {
		for (const filename of corpus()) {
			const result = parse(filename)
			expect(result.title.length).toBeGreaterThan(0)
		}
	})

	it("classifies every bracket-tagged release as fansub or ambiguous, never western", () => {
		const bracketed = corpus().filter((f) => /^\[[^\]]+\]/.test(f))
		for (const filename of bracketed) {
			const result = parse(filename)
			expect(["fansub", "ambiguous"]).toContain(result.signal)
		}
	})
})
