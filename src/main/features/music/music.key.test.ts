import { describe, expect, it } from "vitest"
import { musicKey } from "./music.key"

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
