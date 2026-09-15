import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it } from "vitest"
import { presenceKey } from "./presence.keys"

function status(overrides: Partial<VlcStatus> = {}): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 3,
		playback: { position: 10, time: 10, duration: 200, rate: 1 },
		mediaType: "audio",
		media: { title: "Probablemente", artist: "Christian Nodal", album: "Ahora" },
		...overrides,
	}
}

describe("presenceKey", () => {
	it("is stable across calls with the same status and epoch", () => {
		expect(presenceKey(status(), 0)).toBe(presenceKey(status(), 0))
	})

	it("does not change when only playback position advances", () => {
		const a = presenceKey(
			status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
			0,
		)
		const b = presenceKey(
			status({ playback: { position: 45, time: 45, duration: 200, rate: 1 } }),
			0,
		)

		expect(a).toBe(b)
	})

	it("changes when plid changes, meaning the track changed", () => {
		const a = presenceKey(status({ plid: 3 }), 0)
		const b = presenceKey(status({ plid: 4 }), 0)

		expect(a).not.toBe(b)
	})

	it("changes when playback state changes between playing and paused", () => {
		const a = presenceKey(status({ status: "playing" }), 0)
		const b = presenceKey(status({ status: "paused" }), 0)

		expect(a).not.toBe(b)
	})

	it("changes when rate changes", () => {
		const a = presenceKey(
			status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
			0,
		)
		const b = presenceKey(
			status({ playback: { position: 10, time: 10, duration: 200, rate: 1.5 } }),
			0,
		)

		expect(a).not.toBe(b)
	})

	it("changes when the epoch changes, even with identical status", () => {
		expect(presenceKey(status(), 0)).not.toBe(presenceKey(status(), 1))
	})

	it("treats missing title, artist and album as distinct from the string 'undefined'", () => {
		const key = presenceKey(status({ media: {} }), 0)

		expect(key).not.toContain("undefined")
	})

	it("distinguishes a missing plid (streams, live sources) from plid 0", () => {
		const a = presenceKey(status({ plid: null }), 0)
		const b = presenceKey(status({ plid: 0 }), 0)

		expect(a).not.toBe(b)
	})
})
