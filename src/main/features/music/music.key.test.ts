import { describe, expect, it } from "vitest"
import { audioOverrideKey, musicKey, overrideCoversTrack } from "./music.key"

describe("musicKey", () => {
	it("ignores case, accents and punctuation", () => {
		const tagged = musicKey({ artists: ["Christian Nodal"], title: "Me Dejé Llevar" })
		const sloppy = musicKey({ artists: ["christian  nodal"], title: "me deje, llevar!" })
		expect(sloppy).toBe(tagged)
	})

	it("does not depend on the order of the artists", () => {
		const forward = musicKey({
			artists: ["Christian Nodal", "David Bisbal"],
			title: "Probablemente",
		})
		const reversed = musicKey({
			artists: ["David Bisbal", "Christian Nodal"],
			title: "Probablemente",
		})
		expect(reversed).toBe(forward)
	})

	it("separates the same recording tagged with two different albums", () => {
		// The album picks which release supplies the cover, so the album track and
		// the single resolve to two different covers. One key would serve whichever
		// of them resolved first to both files.
		const onTheAlbum = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		const onTheSingle = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Probablemente - Single",
		})
		expect(onTheSingle).not.toBe(onTheAlbum)
	})

	it("separates a file with no album tag from one that has it", () => {
		const untagged = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const tagged = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Ahora",
		})
		expect(tagged).not.toBe(untagged)
	})

	it("ignores case and punctuation in the album too", () => {
		const tagged = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		const sloppy = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "me deje llevar!",
		})
		expect(sloppy).toBe(tagged)
	})

	it("separates two titles by the same artist", () => {
		const first = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const second = musicKey({ artists: ["Christian Nodal"], title: "Adiós Amor" })
		expect(second).not.toBe(first)
	})

	it("separates two artists with the same title", () => {
		const first = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const second = musicKey({ artists: ["David Bisbal"], title: "Probablemente" })
		expect(second).not.toBe(first)
	})

	it("separates a solo credit from the collaboration that shares its title", () => {
		const solo = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const duet = musicKey({
			artists: ["Christian Nodal", "David Bisbal"],
			title: "Probablemente",
		})
		expect(duet).not.toBe(solo)
	})
})

describe("audioOverrideKey", () => {
	it("gives every track of a record the same key, so one correction covers it", () => {
		const first = audioOverrideKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		const second = audioOverrideKey({
			artists: ["Christian Nodal"],
			title: "De Los Besos Que Te Di",
			album: "Me Dejé Llevar",
		})
		expect(second).toBe(first)
	})

	it("ignores the collaborators the title's suffix contributed", () => {
		const solo = audioOverrideKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		const duet = audioOverrideKey({
			artists: ["Christian Nodal", "David Bisbal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		expect(duet).toBe(solo)
	})

	it("falls back to the title when the file carries no album tag", () => {
		const untagged = audioOverrideKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		expect(untagged).toBe("audio:christian nodal|probablemente")
	})
})

describe("overrideCoversTrack", () => {
	const record = {
		artists: ["Christian Nodal"],
		title: "Probablemente",
		album: "Me Dejé Llevar",
	}

	it("matches another track of the same record, which no prefix of the key would", () => {
		const sibling = musicKey({
			artists: ["Christian Nodal"],
			title: "De Los Besos Que Te Di",
			album: "Me Dejé Llevar",
		})
		expect(overrideCoversTrack(sibling, audioOverrideKey(record))).toBe(true)
	})

	it("does not match another record by the same artist", () => {
		const other = musicKey({ artists: ["Christian Nodal"], title: "Adiós Amor", album: "Ahora" })
		expect(overrideCoversTrack(other, audioOverrideKey(record))).toBe(false)
	})

	it("does not match the same record credited to somebody else", () => {
		const other = musicKey({
			artists: ["David Bisbal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		expect(overrideCoversTrack(other, audioOverrideKey(record))).toBe(false)
	})

	it("matches a track credited to the artist among collaborators", () => {
		const duet = musicKey({
			artists: ["David Bisbal", "Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		expect(overrideCoversTrack(duet, audioOverrideKey(record))).toBe(true)
	})

	it("matches by title only for the untagged file the override was keyed from", () => {
		const untagged = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const onTheAlbum = musicKey(record)
		const key = audioOverrideKey({ artists: ["Christian Nodal"], title: "Probablemente" })

		expect(overrideCoversTrack(untagged, key)).toBe(true)
		expect(overrideCoversTrack(onTheAlbum, key)).toBe(false)
	})

	it("matches nothing for a key that belongs to the other feature", () => {
		expect(overrideCoversTrack(musicKey(record), "tv:Red River|1")).toBe(false)
	})
})
