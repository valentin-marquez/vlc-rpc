import { describe, expect, it } from "vitest"
import { type CorrectionRow, correctionSummary } from "./media.format"

const SETTLED = { kind: "settled" } as const

const BY_FILE: CorrectionRow = {
	key: "file:C:\\Music\\Ripped\\track01.mp3",
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
		const applying = { kind: "applying", key: BY_FILE.key, outcome: "saved" } as const

		expect(correctionSummary({ ...BY_FILE, active: true }, applying)).toBe(
			"Looking the file up again",
		)
	})

	it("reports a removal as what it goes back to", () => {
		const applying = { kind: "applying", key: BY_FILE.key, outcome: "removed" } as const

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
