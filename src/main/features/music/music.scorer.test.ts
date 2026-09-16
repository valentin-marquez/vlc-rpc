import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("electron", () => ({
	app: { getVersion: () => "4.1.0" },
}))

import { ITunesProvider } from "./music.itunes"
import { MusicBrainzProvider } from "./music.musicbrainz"
import { pickBest } from "./music.scorer"
import type { RecordingCandidate, TrackQuery } from "./music.types"

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
		const winner = pickBest(TAGGED_FILE, candidates)

		expect(winner?.id).toBe("1440902743")
		expect(winner?.artists).toEqual(["Christian Nodal"])
		expect(winner?.releases[0]?.title).toBe("Me Dejé Llevar")
	})

	it("picks the solo version out of the captured MusicBrainz response", async () => {
		respondWith("musicbrainz-recording-search-response")

		const candidates = await new MusicBrainzProvider().search(TAGGED_FILE)
		const winner = pickBest(TAGGED_FILE, candidates)

		expect(winner?.id).toBe("097cfb49-419c-4b00-97f3-cc86ef4d77c2")
		expect(winner?.artists).toEqual(["Christian Nodal"])
	})
})
