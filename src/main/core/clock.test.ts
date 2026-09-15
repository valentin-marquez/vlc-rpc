import { describe, expect, it } from "vitest"
import { SystemClock } from "./clock"

describe("SystemClock", () => {
	it("returns the current time in milliseconds, close to Date.now()", () => {
		const clock = new SystemClock()
		const before = Date.now()
		const value = clock.now()
		const after = Date.now()

		expect(value).toBeGreaterThanOrEqual(before)
		expect(value).toBeLessThanOrEqual(after)
	})
})
