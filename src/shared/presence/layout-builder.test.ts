import { describe, expect, it } from "vitest"
import type { LayoutPiece } from "./layout"
import { textPiece, valuePiece, videoVariables } from "./layout"
import type { BuilderLine, BuilderSample } from "./layout-builder"
import { groupRepeats, inspectLayout } from "./layout-builder"

const TAGGED: BuilderSample = {
	id: "tagged",
	label: "This track",
	variables: { title: "15 Step", artist: "Radiohead", album: "In Rainbows" },
}
const UNTAGGED: BuilderSample = {
	id: "untagged",
	label: "A file with no tags",
	variables: { title: "track01", artist: "", album: "" },
}

const SERIES: BuilderSample = {
	id: "series",
	label: "A TV show",
	variables: videoVariables({ title: "Breaking Bad", season: 2, episode: 5 }),
}
const FILM: BuilderSample = {
	id: "film",
	label: "A film",
	variables: videoVariables({ title: "The Matrix", year: 1999 }),
}

function lines(...entries: [string, ...LayoutPiece[]][]): BuilderLine[] {
	return entries.map(([id, ...pieces]) => ({ id, label: id, line: pieces }))
}

describe("inspectLayout", () => {
	it("shows what each line draws for each sample", () => {
		const report = inspectLayout(
			lines(["name", valuePiece("title")], ["details", textPiece("by"), valuePiece("artist")]),
			[TAGGED],
		)
		expect(report.lines[0]?.draws[0]?.text).toBe("15 Step")
		expect(report.lines[1]?.draws[0]?.text).toBe("by Radiohead")
	})

	it("leaves a line alone when only one example empties it, which is the pieces working", () => {
		const report = inspectLayout(lines(["state", textPiece("on"), valuePiece("album")]), [
			TAGGED,
			UNTAGGED,
		])
		expect(report.lines[0]?.draws.map((draw) => draw.text)).toEqual(["on In Rainbows", ""])
		expect(report.lines[0]?.neverDraws).toBe(false)
	})

	it("flags a line that holds pieces and draws nothing for any example", () => {
		const report = inspectLayout(lines(["state", textPiece("on"), valuePiece("album")]), [UNTAGGED])
		expect(report.lines[0]?.neverDraws).toBe(true)
	})

	it("reads one line for a series and for a film without an alternative in sight", () => {
		const report = inspectLayout(
			lines(
				["details", valuePiece("title")],
				["state", valuePiece("episodeInfo"), valuePiece("year")],
			),
			[SERIES, FILM],
		)
		expect(report.lines[1]?.draws.map((draw) => draw.text)).toEqual(["S2E5", "1999"])
		expect(report.lines[1]?.neverDraws).toBe(false)
	})

	it("catches the same value drawn on two lines, which is the mistake the presets shipped", () => {
		const report = inspectLayout(
			lines(
				["name", valuePiece("album")],
				["details", valuePiece("album")],
				["state", valuePiece("title"), textPiece("by"), valuePiece("artist")],
			),
			[TAGGED],
		)
		expect(report.repeats).toEqual([
			{ sampleId: "tagged", variable: "album", lineIds: ["name", "details"], sameText: true },
		])
	})

	it("catches a value repeated inside different words, not just an identical line", () => {
		const report = inspectLayout(
			lines(
				["name", valuePiece("artist")],
				["details", valuePiece("title")],
				["state", textPiece("by"), valuePiece("artist")],
			),
			[TAGGED],
		)
		expect(report.repeats).toEqual([
			{ sampleId: "tagged", variable: "artist", lineIds: ["name", "state"], sameText: false },
		])
	})

	it("reports nothing wrong with an arrangement that draws three distinct values", () => {
		const report = inspectLayout(
			lines(
				["name", valuePiece("title")],
				["details", textPiece("by"), valuePiece("artist")],
				["state", textPiece("on"), valuePiece("album")],
			),
			[TAGGED, UNTAGGED],
		)
		expect(report.repeats).toEqual([])
		expect(report.stranded).toEqual([])
	})

	it("groups one mistake seen in several examples into a single note", () => {
		const report = inspectLayout(
			lines(["details", valuePiece("title")], ["state", valuePiece("title")]),
			[SERIES, FILM],
		)
		expect(report.repeats).toHaveLength(2)
		expect(groupRepeats(report.repeats)).toEqual([
			{
				variable: "title",
				lineIds: ["details", "state"],
				sampleIds: ["series", "film"],
				sameText: true,
			},
		])
	})

	it("catches a separator left on a line with no value to travel with", () => {
		const report = inspectLayout(lines(["state", textPiece("-")]), [TAGGED])
		expect(report.stranded).toEqual([{ lineId: "state", text: "-" }])
	})

	it("leaves words alone when they have a value to disappear with", () => {
		expect(
			inspectLayout(lines(["state", textPiece("-"), valuePiece("album")]), [UNTAGGED]).stranded,
		).toEqual([])
	})

	it("catches a separator the value after it keeps alive, which the pieces alone do not show", () => {
		// The engine binds words to the value that follows them, so the dash outlives the
		// artist it was placed beside and the profile reads "- track01".
		const report = inspectLayout(
			lines(["state", valuePiece("artist"), textPiece("-"), valuePiece("title")]),
			[UNTAGGED],
		)
		expect(report.lines[0]?.draws[0]?.text).toBe("- track01")
		expect(report.stranded).toEqual([{ lineId: "state", text: "-" }])
	})

	it("leaves a separator alone while it has a value on either side of it", () => {
		expect(
			inspectLayout(lines(["state", valuePiece("artist"), textPiece("-"), valuePiece("title")]), [
				TAGGED,
			]).stranded,
		).toEqual([])
	})

	it("says nothing about brackets the engine takes off with the value inside them", () => {
		// A bracket does sit between two values with one of them empty, and the line
		// still draws "Breaking Bad": the guard asks the engine what it drew.
		const report = inspectLayout(
			lines(["state", valuePiece("title"), textPiece("("), valuePiece("year"), textPiece(")")]),
			[SERIES, FILM],
		)

		expect(report.lines[0]?.draws.map((draw) => draw.text)).toEqual([
			"Breaking Bad",
			"The Matrix (1999)",
		])
		expect(report.stranded).toEqual([])
	})

	it("leaves an emoji alone, which no missing value can strand", () => {
		// Nothing a person types for its own sake is a leftover. A mark is what a
		// removed value leaves behind, which is the punctuation people separate with.
		const report = inspectLayout(lines(["state", valuePiece("title"), textPiece("🎵")]), [TAGGED])

		expect(report.lines[0]?.draws[0]?.text).toBe("15 Step 🎵")
		expect(report.stranded).toEqual([])
	})

	it("leaves an emoji alone even where a dash in its place would be stray", () => {
		// Same position, same missing artist: a dash there separates one thing from
		// nothing, and an emoji is not separating anything to begin with.
		const report = inspectLayout(
			lines(["state", valuePiece("artist"), textPiece("🎵"), valuePiece("title")]),
			[UNTAGGED],
		)

		expect(report.lines[0]?.draws[0]?.text).toBe("🎵 track01")
		expect(report.stranded).toEqual([])
	})

	it("says a stray mark once however many examples draw it", () => {
		const report = inspectLayout(
			lines(["state", valuePiece("artist"), textPiece("-"), valuePiece("title")]),
			[UNTAGGED, { ...UNTAGGED, id: "other" }],
		)
		expect(report.stranded).toEqual([{ lineId: "state", text: "-" }])
	})

	it("leaves a line of real words alone, which is a caption somebody meant to write", () => {
		expect(
			inspectLayout(lines(["state", textPiece("Listening to music")]), [TAGGED]).stranded,
		).toEqual([])
	})

	it("says nothing about a line nobody has arranged yet", () => {
		const report = inspectLayout(lines(["state"]), [TAGGED])
		expect(report.lines[0]?.neverDraws).toBe(false)
		expect(report.stranded).toEqual([])
	})
})
