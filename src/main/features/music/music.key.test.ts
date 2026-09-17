import { describe, expect, it } from "vitest"
import {
	audioOverrideKey,
	fileOverrideKey,
	fingerprintKey,
	musicKey,
	overrideCoversTrack,
} from "./music.key"

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

describe("fileOverrideKey", () => {
	it("names one file and no other, which is what an untagged file has left", () => {
		const first = fileOverrideKey("C:\\Music\\Ripped\\track01.mp3")
		const second = fileOverrideKey("C:\\Music\\Other\\track01.mp3")
		expect(second).not.toBe(first)
	})

	it("carries the path in the open, so the list can say which file it is", () => {
		expect(fileOverrideKey("/home/v/Music/track01.mp3")).toBe("file:/home/v/Music/track01.mp3")
	})

	it("does not move when the file is retouched, unlike the fingerprint entry", () => {
		// The fingerprint key retires on a new size or mtime because its answer is
		// derived from the bytes. A correction is the user's word about the file, so
		// a tag editor writing to it must not silently throw the correction away.
		const before = fileOverrideKey("/home/v/Music/track01.mp3")
		const afterRetag = fileOverrideKey("/home/v/Music/track01.mp3")
		expect(afterRetag).toBe(before)
		expect(before).not.toBe(
			fingerprintKey({ path: "/home/v/Music/track01.mp3", size: 1, modifiedAt: 2 }),
		)
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

describe("fingerprintKey", () => {
	const file = { path: "C:\\Music\\track-01.mp3", size: 5_242_880, modifiedAt: 1_726_500_000_000 }

	it("is stable for the same file", () => {
		expect(fingerprintKey({ ...file })).toBe(fingerprintKey({ ...file }))
	})

	it("tells two untagged files apart, which their tag derived key cannot", () => {
		// Both files answer the same to every question the tag key asks, so one
		// key would hand the first one identified its cover to all of them.
		const untagged = { artists: [], title: "Unknown" }
		expect(musicKey(untagged)).toBe(musicKey(untagged))

		const other = { ...file, path: "C:\\Music\\track-02.mp3" }
		expect(fingerprintKey(other)).not.toBe(fingerprintKey(file))
	})

	it("stops answering for a file whose bytes changed", () => {
		expect(fingerprintKey({ ...file, size: file.size + 1 })).not.toBe(fingerprintKey(file))
		expect(fingerprintKey({ ...file, modifiedAt: file.modifiedAt + 1 })).not.toBe(
			fingerprintKey(file),
		)
	})

	it("is out of reach of an override eviction, which only walks track keys", () => {
		const key = audioOverrideKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		expect(overrideCoversTrack(fingerprintKey(file), key)).toBe(false)
	})

	it("carries no part of the path, which would put a filename in the cache file", () => {
		expect(fingerprintKey(file)).not.toContain("track-01")
	})
})
