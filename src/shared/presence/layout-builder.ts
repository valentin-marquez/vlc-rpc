/**
 * What the Layout builder needs to know about an arrangement before it is saved.
 *
 * The renderer has no test harness, so everything here is a pure function over the same
 * pieces the presence loop renders. What the builder draws can then only ever be what the
 * profile draws, and the mistake the old presets shipped is caught where it is made.
 */

import type { LayoutLine, TemplateVariables } from "./layout"
import { drawnPieces, drawnValue, renderLine } from "./layout"

export interface BuilderLine {
	id: string
	label: string
	line: LayoutLine
}

export interface BuilderSample {
	id: string
	label: string
	variables: TemplateVariables
}

export interface LineDraw {
	sampleId: string
	text: string
}

export interface LineReport {
	id: string
	label: string
	draws: readonly LineDraw[]
	/**
	 * The line holds pieces and not one example gets anything out of it. A line that is
	 * empty for one example and not another is the point of the pieces, and the second card
	 * shows it; a line that is empty for all of them is an arrangement dead on arrival, and
	 * nothing on screen says so.
	 */
	neverDraws: boolean
}

export interface RepeatedValue {
	sampleId: string
	variable: string
	lineIds: readonly string[]
	/** The lines draw the identical text, not the same value inside different words. */
	sameText: boolean
}

export interface RepeatGroup {
	variable: string
	lineIds: readonly string[]
	sampleIds: readonly string[]
	sameText: boolean
}

/** A separator an example would draw with nothing on one side of it. */
export interface StrandedText {
	lineId: string
	text: string
}

export interface LayoutReport {
	lines: readonly LineReport[]
	repeats: readonly RepeatedValue[]
	stranded: readonly StrandedText[]
}

export function inspectLayout(
	lines: readonly BuilderLine[],
	samples: readonly BuilderSample[],
): LayoutReport {
	return {
		lines: lines.map((line) => inspectLine(line, samples)),
		repeats: findRepeats(lines, samples),
		stranded: findStranded(lines, samples),
	}
}

function inspectLine(
	{ id, label, line }: BuilderLine,
	samples: readonly BuilderSample[],
): LineReport {
	const draws = samples.map((sample) => ({
		sampleId: sample.id,
		text: renderLine(line, sample.variables),
	}))

	return {
		id,
		label,
		draws,
		neverDraws: line.length > 0 && draws.every((draw) => draw.text === ""),
	}
}

function filledValues(line: LayoutLine, variables: TemplateVariables): readonly string[] {
	const names: string[] = []

	for (const piece of line) {
		if (piece.kind !== "value" || names.includes(piece.name)) continue
		if (drawnValue(piece.name, variables) !== "") names.push(piece.name)
	}

	return names
}

/**
 * The mistake the shipped presets made: three lines, one of the values drawn twice. It was
 * invisible in a preview that hid the first line and is obvious in one that does not, so
 * the builder names it either way.
 */
function findRepeats(
	lines: readonly BuilderLine[],
	samples: readonly BuilderSample[],
): readonly RepeatedValue[] {
	const repeats: RepeatedValue[] = []

	for (const sample of samples) {
		const drawn = new Map<string, string>()
		const byValue = new Map<string, string[]>()

		for (const { id, line } of lines) {
			const rendered = renderLine(line, sample.variables)
			if (rendered === "") continue

			drawn.set(id, rendered)
			for (const name of filledValues(line, sample.variables)) {
				byValue.set(name, [...(byValue.get(name) ?? []), id])
			}
		}

		for (const [variable, lineIds] of byValue) {
			if (lineIds.length < 2) continue
			const texts = lineIds.map((id) => drawn.get(id))
			repeats.push({
				sampleId: sample.id,
				variable,
				lineIds,
				sameText: texts.every((one) => one === texts[0]),
			})
		}
	}

	return repeats
}

/**
 * A stray mark on a profile is the one thing the builder refuses to save, so what counts
 * as drawn is asked of the engine rather than worked out again here: the engine binds
 * words to the value after them and falls back to the one before, and a guard that read
 * the pieces alone would call the dash in [Artist, "-", Title] clean for a file with no
 * artist, where the profile says "- track01".
 *
 * Stray is narrow on purpose. A mark between two value pieces is a separator, and it is
 * stray when either of them draws nothing, because then it separates one thing from
 * nothing. A mark with a value on one side only was put there to sit beside that value,
 * and a line holding no value pieces at all cannot lose anything, so what it holds stands
 * alone by construction.
 */
function findStranded(
	lines: readonly BuilderLine[],
	samples: readonly BuilderSample[],
): readonly StrandedText[] {
	// One mistake, said once, however many examples draw it.
	const found = new Map<string, StrandedText>()

	for (const { id, line } of lines) {
		for (const sample of samples) {
			for (const stray of straysIn(line, sample.variables)) {
				found.set(`${id}|${stray}`, { lineId: id, text: stray })
			}
		}
	}

	return [...found.values()]
}

function straysIn(line: LayoutLine, variables: TemplateVariables): readonly string[] {
	const drawn = drawnPieces(line, variables)
	const holdsValue = line.some((piece) => piece.kind === "value")

	return line.flatMap((piece, index) => {
		const text = drawn[index]
		if (piece.kind !== "text" || text === undefined || text === null || !isMark(text)) return []
		if (!holdsValue) return [text]

		const before = nearestValue(line, index, -1)
		const after = nearestValue(line, index, 1)
		if (before === null || after === null) return []

		const separates = drawnValue(before, variables) !== "" && drawnValue(after, variables) !== ""
		return separates ? [] : [text]
	})
}

function nearestValue(line: LayoutLine, index: number, step: number): string | null {
	for (let at = index + step; at >= 0 && at < line.length; at += step) {
		const piece = line[at]
		if (piece?.kind === "value") return piece.name
	}

	return null
}

/**
 * What a removed value leaves behind is what people type as separators: a dash, a slash, a
 * pipe, a colon, a bracket. An emoji is never a leftover, so it is not a mark.
 */
const MARK_CHARACTERS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

function isMark(text: string): boolean {
	return [...text].every((character) => MARK_CHARACTERS.includes(character))
}

/**
 * The same value on the same two lines is one mistake however many examples show it, so the
 * builder says it once and names the examples only when it does not happen for all of them.
 */
export function groupRepeats(repeats: readonly RepeatedValue[]): readonly RepeatGroup[] {
	const groups = new Map<string, RepeatGroup>()

	for (const repeat of repeats) {
		const id = `${repeat.variable}|${repeat.lineIds.join(",")}`
		const found = groups.get(id)
		groups.set(id, {
			variable: repeat.variable,
			lineIds: repeat.lineIds,
			sampleIds: [...(found?.sampleIds ?? []), repeat.sampleId],
			sameText: (found?.sameText ?? true) && repeat.sameText,
		})
	}

	return [...groups.values()]
}
