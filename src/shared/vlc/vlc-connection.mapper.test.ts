import { describe, expect, it } from "vitest"
import { describeVlcConnection } from "./vlc-connection.mapper"
import { VLC_CONNECTION_REASONS } from "./vlc.types"

describe("describeVlcConnection", () => {
	it("answers for every reason", () => {
		for (const reason of VLC_CONNECTION_REASONS) {
			const advice = describeVlcConnection(reason)

			expect(advice.state.length).toBeGreaterThan(0)
			expect(advice.headline.length).toBeGreaterThan(0)
			expect(advice.detail.length).toBeGreaterThan(0)
		}
	})

	it("treats VLC not being open as a warning, not an error", () => {
		expect(describeVlcConnection("not-running").severity).toBe("warning")
	})

	it("keeps setup and slowness as warnings, and real failures as errors", () => {
		const severities = Object.fromEntries(
			VLC_CONNECTION_REASONS.map((reason) => [reason, describeVlcConnection(reason).severity]),
		)

		expect(severities).toEqual({
			running: "ok",
			"not-configured": "warning",
			"not-running": "warning",
			timeout: "warning",
			"auth-failed": "error",
			"misconfigured-endpoint": "error",
			"unexpected-status": "error",
			"unknown-error": "error",
		})
	})

	it("offers a remedy only where the app can take the user somewhere useful", () => {
		const remedies = Object.fromEntries(
			VLC_CONNECTION_REASONS.map((reason) => [reason, describeVlcConnection(reason).remedy.kind]),
		)

		expect(remedies).toEqual({
			running: "none",
			"not-configured": "enable-http",
			"not-running": "none",
			timeout: "none",
			"auth-failed": "open-settings",
			"misconfigured-endpoint": "open-settings",
			"unexpected-status": "none",
			"unknown-error": "open-settings",
		})
	})

	it("says to restart VLC wherever a vlcrc change is what fixes it", () => {
		// VLC reads vlcrc once, at startup, so naming the error would be worth
		// less to the reader than naming the restart.
		for (const reason of ["not-configured", "auth-failed", "misconfigured-endpoint"] as const) {
			expect(describeVlcConnection(reason).detail).toContain("restart VLC")
		}
	})

	it("never puts the mechanics in front of the reader", () => {
		const jargon = /fetch|econn|http|status code|exception|stack|undefined|null/i

		for (const reason of VLC_CONNECTION_REASONS) {
			const { state, headline, detail, remedy } = describeVlcConnection(reason)
			const copy = [state, headline, detail, remedy.kind === "none" ? "" : remedy.label]

			for (const line of copy) {
				expect(line).not.toMatch(jargon)
			}
		}
	})

	it("writes every line as a sentence, with no em dash and no mid dot", () => {
		// Built from code points so the one file that polices the punctuation is
		// not the one file that contains it: em dash, en dash, mid dot, bullet.
		const banned = [0x2014, 0x2013, 0x00b7, 0x2022].map((code) => String.fromCodePoint(code))

		for (const reason of VLC_CONNECTION_REASONS) {
			const { state, headline, detail, remedy } = describeVlcConnection(reason)
			const copy = [state, headline, detail, remedy.kind === "none" ? "ok" : remedy.label]

			for (const line of copy) {
				for (const mark of banned) {
					expect(line).not.toContain(mark)
				}
			}

			expect(headline).toMatch(/^[A-Z]/)
			expect(detail).toMatch(/\.$/)
			expect(state).toMatch(/^[a-z]/)
		}
	})
})
