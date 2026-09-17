import { describe, expect, it } from "vitest"
import { type CorrectionRow, audioMatchRow, correctionSummary } from "./media.format"

const SETTLED = { kind: "settled" } as const

const FILE_KEY = "file:C:\\Music\\Ripped\\track01.mp3"

const BY_FILE: CorrectionRow = {
	key: FILE_KEY,
	active: false,
	binding: "file",
}

const BY_METADATA: CorrectionRow = { key: "video:sousou no frieren", active: false, binding: null }

describe("correctionSummary", () => {
	it("says a correction is saved once one is", () => {
		expect(correctionSummary({ ...BY_METADATA, active: true }, SETTLED)).toBe("Saved for this file")
	})

	it("says a file bound correction is held against the file, saved or not", () => {
		expect(correctionSummary(BY_FILE, SETTLED)).toBe("Not set, held against this file")
		expect(correctionSummary({ ...BY_FILE, active: true }, SETTLED)).toBe("Saved against this file")
	})

	it("reports the lookup a save sets off, rather than the answer it has not got yet", () => {
		const applying = { kind: "applying", key: FILE_KEY, outcome: "saved" } as const

		expect(correctionSummary({ ...BY_FILE, active: true }, applying)).toBe(
			"Looking the file up again",
		)
	})

	it("reports a removal as what it goes back to", () => {
		const applying = { kind: "applying", key: FILE_KEY, outcome: "removed" } as const

		expect(correctionSummary(BY_FILE, applying)).toBe("Going back to what the app worked out")
	})

	it("leaves a row alone while another file's correction is being applied", () => {
		// The file can change under a lookup that is still running, and the row then
		// belongs to a file the correction has nothing to do with.
		const applying = {
			kind: "applying",
			key: "file:C:\\Music\\Other.mp3",
			outcome: "saved",
		} as const

		expect(correctionSummary(BY_FILE, applying)).toBe("Not set, held against this file")
	})
})

describe("audioMatchRow", () => {
	it("says nothing for a file that names itself", () => {
		expect(audioMatchRow(null, false)).toBeNull()
	})

	it("says nothing when the words on screen are the ones the user typed", () => {
		// The correction row above already answers for those, and two rows about
		// one decision read as two decisions.
		expect(audioMatchRow("correction", true)).toBeNull()
	})

	it("declares a name the app matched from the audio, and offers to refuse it", () => {
		expect(audioMatchRow("identification", false)).toEqual({
			kind: "decidable",
			value: "Matched from the audio",
			button: "Use what the file says",
			action: "refuse",
		})
	})

	it("declares the match without a button when the file already carries a correction", () => {
		// Refusing files a correction, and a file has one: the click would take
		// away the cover this user went and found by hand.
		expect(audioMatchRow("identification", true)).toEqual({
			kind: "declared",
			value: "Matched from the audio",
		})
	})

	it("offers the way back once the match has been refused", () => {
		expect(audioMatchRow("as-is", true)).toEqual({
			kind: "decidable",
			value: "Turned off for this file",
			button: "Use the match again",
			action: "restore",
		})
	})
})
