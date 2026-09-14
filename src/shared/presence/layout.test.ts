import { describe, expect, it } from "vitest"
import { applyTemplate, getDefaultLayout, getLayoutByPreset } from "./layout"

// Characterization tests: these pin down what the code does today, quirks
// included. A later diff here is the list of behavior changes you actually made.

describe("applyTemplate", () => {
	it("substitutes every placeholder it is given a value for", () => {
		expect(applyTemplate("{title} by {artist}", { title: "Probablemente", artist: "Nodal" })).toBe(
			"Probablemente by Nodal",
		)
	})

	it("strips placeholders with no matching variable", () => {
		expect(applyTemplate("{title} ({year})", { title: "Probablemente" })).toBe("Probablemente ()")
	})

	it("substitutes Unknown for any falsy value, including 0 and empty string", () => {
		expect(applyTemplate("{season}", { season: 0 })).toBe("Unknown")
		expect(applyTemplate("{album}", { album: "" })).toBe("Unknown")
		expect(applyTemplate("{album}", { album: undefined })).toBe("Unknown")
	})

	it("collapses repeated separators and trims them from both ends", () => {
		expect(applyTemplate("- {a} - - {b} -", { a: "x", b: "y" })).toBe("x - y")
		expect(applyTemplate("• {a} • • {b} •", { a: "x", b: "y" })).toBe("x • y")
	})

	it("falls back to Unknown when the template resolves to nothing", () => {
		expect(applyTemplate("{missing}", {})).toBe("Unknown")
		expect(applyTemplate("   ", {})).toBe("Unknown")
	})

	it("leaves a literal string with no placeholders untouched", () => {
		expect(applyTemplate("VLC", {})).toBe("VLC")
	})
})

describe("layout presets", () => {
	it("returns the default preset", () => {
		expect(getDefaultLayout()).toEqual(getLayoutByPreset("default"))
		expect(getDefaultLayout().musicDetails).toBe("{title}")
	})

	it("falls back to default for an unknown preset", () => {
		expect(getLayoutByPreset("nope" as never)).toEqual(getDefaultLayout())
	})

	it("gives every preset the five template fields the renderer expects", () => {
		for (const preset of ["default", "album-focused", "artist-spotlight"] as const) {
			const layout = getLayoutByPreset(preset)
			expect(layout.activityName).toBeTypeOf("string")
			expect(layout.musicDetails).toBeTypeOf("string")
			expect(layout.musicState).toBeTypeOf("string")
			expect(layout.videoDetails).toBeTypeOf("string")
			expect(layout.videoState).toBeTypeOf("string")
		}
	})
})
