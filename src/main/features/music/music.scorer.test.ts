import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("electron", () => ({
	app: { getVersion: () => "4.1.0" },
}))

import { AcoustId } from "./music.acoustid"
import { ITunesProvider } from "./music.itunes"
import { MusicBrainzProvider } from "./music.musicbrainz"
import { pickBest, pickIdentified } from "./music.scorer"
import type { FingerprintMatch, RecordingCandidate, TrackQuery } from "./music.types"

function query(overrides: Partial<TrackQuery> = {}): TrackQuery {
	return { artists: ["Christian Nodal"], title: "Probablemente", ...overrides }
}

function candidate(overrides: Partial<RecordingCandidate> = {}): RecordingCandidate {
	return {
		provider: "itunes",
		id: "1",
		title: "Probablemente",
		artists: ["Christian Nodal"],
		releases: [{ title: "Me Dejé Llevar" }],
		rank: 0,
		...overrides,
	}
}

const solo = candidate({
	id: "solo",
	artists: ["Christian Nodal"],
	releases: [{ title: "Me Dejé Llevar" }],
	// Deliberately the worse rank of the pair, so a win here cannot come from
	// the tie break.
	rank: 1,
})

const collaboration = candidate({
	id: "collaboration",
	artists: ["Christian Nodal", "David Bisbal"],
	releases: [{ title: "Probablemente (feat. David Bisbal) - Single" }],
	rank: 0,
})

describe("pickBest, the shape of the credit", () => {
	it("picks the solo version when the tag names one artist", () => {
		expect(pickBest(query(), [collaboration, solo])?.id).toBe("solo")
	})

	it("picks the solo version with the candidates reversed too", () => {
		// Same lineup, opposite order: the credit has to decide this, not the
		// position the provider happened to return.
		expect(pickBest(query(), [solo, collaboration])?.id).toBe("solo")
	})

	it("picks the collaboration when the tag names both artists", () => {
		const both = query({ artists: ["Christian Nodal", "David Bisbal"] })

		expect(pickBest(both, [solo, collaboration])?.id).toBe("collaboration")
		expect(pickBest(both, [collaboration, solo])?.id).toBe("collaboration")
	})

	it("reads the credit as a set, so the order of the tagged artists is irrelevant", () => {
		const reversed = query({ artists: ["David Bisbal", "Christian Nodal"] })

		expect(pickBest(reversed, [solo, collaboration])?.id).toBe("collaboration")
	})
})

describe("pickBest, artist names the tag is never split on", () => {
	// Measured against the live iTunes API: every one of these comes back as a
	// single `artistName`. Splitting the tag on its commas, slashes or ampersands
	// left names that match nothing, excluded the correct candidate at step 1,
	// and cached that miss for a day.
	const WHOLE_NAMES = [
		"AC/DC",
		"Simon & Garfunkel",
		"Lady Gaga & Bradley Cooper",
		"Earth, Wind & Fire",
		"Tyler, The Creator",
		"Daryl Hall & John Oates",
	]

	for (const name of WHOLE_NAMES) {
		it(`keeps the candidate credited to ${name}`, () => {
			const track = candidate({ id: name, artists: [name] })

			expect(pickBest(query({ artists: [name] }), [track])?.id).toBe(name)
		})
	}

	it("matches a duet that a catalog credits as two separate names", () => {
		// MusicBrainz lists what iTunes returns whole, so the tag has to compare
		// against the credit joined, not only name by name.
		const track = candidate({ id: "duet", artists: ["Lady Gaga", "Bradley Cooper"] })

		expect(pickBest(query({ artists: ["Lady Gaga & Bradley Cooper"] }), [track])?.id).toBe("duet")
	})

	it("does not let the whole credit comparison turn into a substring test", () => {
		const track = candidate({ id: "fire", artists: ["Fire"] })

		expect(pickBest(query({ artists: ["Earth, Wind & Fire"] }), [track])).toBeNull()
	})

	it("reads a credit spelled one letter differently as the same credit", () => {
		// The gate already admitted both of these, so with a strict comparison here
		// the solo and the collaboration landed on the same floor and the rank, not
		// the credit, chose the cover.
		const solo = candidate({ id: "solo", artists: ["Lady Gaga & Bradley Cooper"], rank: 1 })
		const remix = candidate({
			id: "remix",
			artists: ["Lady Gaga & Bradley Cooper", "Some Remixer"],
			rank: 0,
		})
		const misspelled = query({ artists: ["Lady Gaga & Bradly Cooper"] })

		expect(pickBest(misspelled, [remix, solo])?.id).toBe("solo")
	})
})

describe("pickBest, the collaboration suffix", () => {
	it("matches the collaboration once the suffix has left the title on both sides", () => {
		// The tag read "Love the Way You Lie (feat. Rihanna)". Stripped on one side
		// only it scored 0.745 against the 0.92 gate and resolved to nothing.
		const collab = candidate({
			id: "collab",
			title: "Love the Way You Lie",
			artists: ["Eminem", "Rihanna"],
			releases: [{ title: "Recovery" }],
		})
		const tagged = query({
			artists: ["Eminem", "Rihanna"],
			title: "Love the Way You Lie",
			album: "Recovery",
		})

		expect(pickBest(tagged, [collab])?.id).toBe("collab")
	})

	it("prefers the collaboration over the solo take when the suffix named a second artist", () => {
		const solo = candidate({ id: "solo", title: "Love the Way You Lie", artists: ["Eminem"] })
		const collab = candidate({
			id: "collab",
			title: "Love the Way You Lie",
			artists: ["Eminem", "Rihanna"],
			rank: 1,
		})
		const tagged = query({ artists: ["Eminem", "Rihanna"], title: "Love the Way You Lie" })

		expect(pickBest(tagged, [solo, collab])?.id).toBe("collab")
	})
})

describe("pickBest, hard exclusion on the artist", () => {
	it("excludes a candidate by a different artist even when the title matches exactly", () => {
		const other = candidate({ id: "other", artists: ["Julión Álvarez"] })

		expect(pickBest(query(), [other])).toBeNull()
	})

	it("keeps a candidate that credits the tagged artist second", () => {
		const featured = candidate({ id: "featured", artists: ["Gera MX", "Christian Nodal"] })

		expect(pickBest(query(), [featured])?.id).toBe("featured")
	})
})

describe("pickBest, identity gate on the title", () => {
	it("refuses a different version of the title instead of ranking it", () => {
		const behindTheScenes = candidate({
			id: "detras",
			title: "Probablemente (Detrás de cámaras)",
		})

		expect(pickBest(query(), [behindTheScenes])).toBeNull()
	})

	it("tolerates accents and punctuation, which normalize folds away", () => {
		const accented = candidate({ id: "accented", title: "Me Dejé Llevar" })

		expect(pickBest(query({ title: "Me Deje Llevar" }), [accented])?.id).toBe("accented")
	})
})

describe("pickBest, the album orients and never punishes", () => {
	it("does not turn a correct identification into null when the album tag matches nothing", () => {
		// The repo's VLC fixture tags this recording as "Ahora" when it belongs to
		// "Me Dejé Llevar". A punishing album would lose the cover here.
		expect(pickBest(query({ album: "Ahora" }), [candidate()])?.id).toBe("1")
	})

	it("prefers the release matching the album tag when the credits tie", () => {
		const single = candidate({ id: "single", releases: [{ title: "Probablemente - Single" }] })
		const album = candidate({
			id: "album",
			releases: [{ title: "Me Dejé Llevar" }],
			rank: 1,
		})

		expect(pickBest(query({ album: "Me Deje Llevar" }), [single, album])?.id).toBe("album")
	})

	it("does not let a matching album outweigh a credit the tag does not name", () => {
		const collaborationOnTheAlbum = candidate({
			id: "collaboration",
			artists: ["Christian Nodal", "David Bisbal"],
			releases: [{ title: "Me Dejé Llevar" }],
		})
		const soloOnASingle = candidate({
			id: "solo",
			releases: [{ title: "Probablemente - Single" }],
			rank: 1,
		})
		const tagged = query({ album: "Me Dejé Llevar" })

		expect(pickBest(tagged, [collaborationOnTheAlbum, soloOnASingle])?.id).toBe("solo")
	})
})

describe("pickBest, no single signal rejects alone", () => {
	it("accepts the worst survivor the gate can admit", () => {
		// Every signal at its floor at once: a title at 0.923, barely over the
		// gate, a credit with a collaborator the tag does not name, and an album
		// tag matching no release. 0.4 * 0.5 + 0.923 * 0.3 + 0.5 * 0.2 = 0.577,
		// over the 0.55 threshold. At the gate floor of 0.92 it would be 0.576,
		// which is the margin the weights are chosen to keep.
		const worst = candidate({
			id: "worst",
			title: "Botella Tras Botella",
			artists: ["Gera MX", "Christian Nodal"],
			releases: [{ title: "Botella Tras Botella - Single" }],
		})
		const tagged = query({ title: "Botellas Tras Botella", album: "Ahora" })

		expect(pickBest(tagged, [worst])?.id).toBe("worst")
	})
})

describe("pickBest, tie breaks", () => {
	it("breaks an exact tie on the lower rank, not on the order of the list", () => {
		const first = candidate({ id: "first", rank: 0 })
		const second = candidate({ id: "second", rank: 1 })

		expect(pickBest(query(), [first, second])?.id).toBe("first")
		expect(pickBest(query(), [second, first])?.id).toBe("first")
	})

	it("returns null for an empty candidate list", () => {
		expect(pickBest(query(), [])).toBeNull()
	})
})

describe("pickBest, against the real normalizers", () => {
	// The hand built cases above all assume a candidate shape. These two are the
	// only thing that checks the shape the normalizers actually produce, so a
	// drift between them would otherwise pass this whole file.
	const TAGGED_FILE: TrackQuery = {
		artists: ["Christian Nodal"],
		title: "Probablemente",
		album: "Ahora",
	}

	/**
	 * Both fixtures return the solo take first, so the rank tie break alone would
	 * satisfy these tests and they would keep passing with the credit
	 * discriminator deleted. Reversed and re-ranked, a collaboration holds rank 0
	 * and only the shape of the credit can still pick the solo.
	 */
	function reversed(candidates: RecordingCandidate[]): RecordingCandidate[] {
		return [...candidates].reverse().map((candidate, index) => ({ ...candidate, rank: index }))
	}

	function respondWith(name: string): void {
		const body = readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(body) })),
		)
	}

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("picks the solo version out of the captured iTunes response", async () => {
		respondWith("itunes-search-response")

		const candidates = await new ITunesProvider().search(TAGGED_FILE)
		const winner = pickBest(TAGGED_FILE, reversed(candidates))

		expect(winner?.id).toBe("1445298058")
		expect(winner?.artists).toEqual(["Christian Nodal"])
		expect(winner?.releases[0]?.title).toBe("Probablemente - Single")
	})

	it("picks the solo version out of the captured MusicBrainz response", async () => {
		respondWith("musicbrainz-recording-search-response")

		const candidates = await new MusicBrainzProvider().search(TAGGED_FILE)
		const winner = pickBest(TAGGED_FILE, reversed(candidates))

		expect(winner?.id).toBe("5697b367-a36c-4b6f-aa0c-ce9e49a9afa7")
		expect(winner?.artists).toEqual(["Christian Nodal"])
	})
})

describe("pickIdentified", () => {
	function match(overrides: Partial<FingerprintMatch> = {}): FingerprintMatch {
		return {
			score: 0.96,
			id: "mbid-1",
			title: "Probablemente",
			artists: ["Christian Nodal"],
			releases: [{ title: "Me dejé llevar", releaseGroupId: "rg-1" }],
			rank: 0,
			...overrides,
		}
	}

	it("has nothing to pick from an empty list", () => {
		expect(pickIdentified([])).toBeNull()
	})

	it("takes a lone match that clears the floor", () => {
		expect(pickIdentified([match()])?.id).toBe("mbid-1")
	})

	it("refuses a match the service is not confident about", () => {
		// 0.8551 is the score the validated capture gives a different recording
		// that shares a vocal take, so a floor under it admits a wrong cover.
		expect(pickIdentified([match({ score: 0.8551 })])).toBeNull()
		expect(pickIdentified([match({ score: 0.899 })])).toBeNull()
	})

	it("refuses two close matches that credit different artists", () => {
		const winner = pickIdentified([
			match({ score: 0.94, id: "solo" }),
			match({ score: 0.93, id: "duet", artists: ["Christian Nodal", "David Bisbal"], rank: 1 }),
		])

		expect(winner).toBeNull()
	})

	it("takes the top when two close matches credit the same artist", () => {
		// Both covers belong to the same performer's catalog, and the release
		// ordering already prefers the album over the single.
		const winner = pickIdentified([
			match({ score: 0.94, id: "album-take" }),
			match({ score: 0.93, id: "single-take", title: "Probablemente (En vivo)", rank: 1 }),
		])

		expect(winner?.id).toBe("album-take")
	})

	it("takes the top when it clears the runner up by more than the margin", () => {
		const winner = pickIdentified([
			match({ score: 0.97, id: "solo" }),
			match({ score: 0.91, id: "duet", artists: ["Christian Nodal", "David Bisbal"], rank: 1 }),
		])

		expect(winner?.id).toBe("solo")
	})

	it("orders by score rather than by the position the service returned", () => {
		const winner = pickIdentified([
			match({ score: 0.91, id: "second-best" }),
			match({ score: 0.98, id: "best", rank: 1 }),
		])

		expect(winner?.id).toBe("best")
	})

	it("picks the solo recording out of the captured AcoustID response", async () => {
		const body = readFileSync(
			join(__dirname, "__fixtures__", "acoustid-lookup-response.json"),
			"utf-8",
		)
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(body) })),
		)

		const outcome = await new AcoustId("test-client-key").lookup("AQADtMqS", 232.97)
		const winner = outcome.kind === "matched" ? pickIdentified(outcome.matches) : null

		expect(winner?.id).toBe("097cfb49-419c-4b00-97f3-cc86ef4d77c2")
		expect(winner?.artists).toEqual(["Christian Nodal"])
		vi.unstubAllGlobals()
	})
})
