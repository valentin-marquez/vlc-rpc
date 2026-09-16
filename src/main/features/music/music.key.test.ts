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

	it("does not depend on the album", () => {
		const untagged = musicKey({ artists: ["Christian Nodal"], title: "Probablemente" })
		const tagged = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Ahora",
		})
		const mistagged = musicKey({
			artists: ["Christian Nodal"],
			title: "Probablemente",
			album: "Me Dejé Llevar",
		})
		expect(tagged).toBe(untagged)
		expect(mistagged).toBe(untagged)
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
