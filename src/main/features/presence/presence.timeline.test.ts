import type { Clock } from "@main/core/clock"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it } from "vitest"
import { Timeline } from "./presence.timeline"

class FakeClock implements Clock {
	private currentMs: number

	constructor(startMs = 0) {
		this.currentMs = startMs
	}

	now(): number {
		return this.currentMs
	}

	advance(ms: number): void {
		this.currentMs += ms
	}
}

function status(overrides: Partial<VlcStatus> = {}): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 3,
		playback: { position: 0, time: 0, duration: 200, rate: 1 },
		mediaType: "audio",
		media: {},
		...overrides,
	}
}

describe("Timeline", () => {
	it("computes start and end on the very first update", () => {
		const clock = new FakeClock(100_000)
		const timeline = new Timeline(clock)

		const window = timeline.update(
			status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
		)

		expect(window.start).toBe(100 - 10) // segundos: now - position
		expect(window.end).toBe(100 + (200 - 10))
	})

	it("bumps the epoch on the very first update", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		expect(timeline.currentEpoch).toBe(0)
		timeline.update(status())
		expect(timeline.currentEpoch).toBe(1)
	})

	it("does not recompute or bump the epoch while a track advances normally", () => {
		const clock = new FakeClock(100_000)
		const timeline = new Timeline(clock)

		const first = timeline.update(
			status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
		)
		const epochAfterFirst = timeline.currentEpoch

		clock.advance(5_000) // 5 segundos reales despues
		const second = timeline.update(
			status({ playback: { position: 15, time: 15, duration: 200, rate: 1 } }),
		)

		expect(second).toEqual(first)
		expect(timeline.currentEpoch).toBe(epochAfterFirst)
	})

	it("clears the window on pause and recomputes it on resume", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		timeline.update(
			status({ status: "playing", playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
		)
		const epochWhilePlaying = timeline.currentEpoch

		const paused = timeline.update(
			status({ status: "paused", playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
		)
		expect(paused).toEqual({})

		clock.advance(30_000)
		const resumed = timeline.update(
			status({ status: "playing", playback: { position: 10, time: 10, duration: 200, rate: 1 } }),
		)

		expect(resumed.start).toBeDefined()
		expect(timeline.currentEpoch).toBe(epochWhilePlaying + 1)
	})

	it("detects a seek when position drifts beyond the threshold", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		timeline.update(status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }))
		const epochBeforeSeek = timeline.currentEpoch

		clock.advance(1_000) // One real second, so the clock reads 1s rather than 0
		// 10s to 150s, far past one second of play plus the 3s threshold
		const afterSeek = timeline.update(
			status({ playback: { position: 150, time: 150, duration: 200, rate: 1 } }),
		)

		expect(timeline.currentEpoch).toBe(epochBeforeSeek + 1)
		expect(afterSeek.start).toBe(1 - 150) // recomputed at second 1, from where it landed
	})

	it("does not treat normal one tick of progress as a seek", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		timeline.update(status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }))
		const epochAfterFirst = timeline.currentEpoch

		clock.advance(1_500) // 1.5 segundos reales
		timeline.update(status({ playback: { position: 12, time: 12, duration: 200, rate: 1 } })) // avanzo ~1.5s, dentro del umbral

		expect(timeline.currentEpoch).toBe(epochAfterFirst)
	})

	it("recomputes when the track changes, even mid playback", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		timeline.update(
			status({ plid: 3, playback: { position: 190, time: 190, duration: 200, rate: 1 } }),
		)
		const epochBefore = timeline.currentEpoch

		const next = timeline.update(
			status({ plid: 4, playback: { position: 0, time: 0, duration: 180, rate: 1 } }),
		)

		expect(timeline.currentEpoch).toBe(epochBefore + 1)
		expect(next.end).toBe(0 + 180)
	})

	it("recomputes when playback rate changes", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)

		timeline.update(status({ playback: { position: 10, time: 10, duration: 200, rate: 1 } }))
		const epochBefore = timeline.currentEpoch

		clock.advance(1_000)
		timeline.update(status({ playback: { position: 11, time: 11, duration: 200, rate: 1.5 } }))

		expect(timeline.currentEpoch).toBe(epochBefore + 1)
	})

	it("returns only a start timestamp for a stream with no known duration", () => {
		const clock = new FakeClock(60_000)
		const timeline = new Timeline(clock)

		const window = timeline.update(
			status({ playback: { position: 0, time: 0, duration: 0, rate: 1 } }),
		)

		expect(window.start).toBe(60)
		expect(window.end).toBeUndefined()
	})
})

describe("Timeline, seconds against VLC's fraction", () => {
	// Every other test in this file sets position and time to the same number, so
	// the suite could not see which field the code read. VLC reports position as a
	// fraction of the track and time as seconds played, and reading the fraction as
	// seconds put the start of every window at "now".
	it("starts the window where the track already is, not at zero", () => {
		const clock = new FakeClock(500_000)
		const timeline = new Timeline(clock)

		// Captured shape: 20 seconds into a 233 second track.
		const window = timeline.update(
			status({ playback: { position: 0.0858, time: 20, duration: 233, rate: 1 } }),
		)

		expect(window.start).toBe(500 - 20)
		expect(window.end).toBe(500 + 213)
	})

	it("sees a seek that moves the playhead, which a fraction never reported", () => {
		const clock = new FakeClock(0)
		const timeline = new Timeline(clock)
		timeline.update(status({ playback: { position: 0.0858, time: 20, duration: 233, rate: 1 } }))
		const before = timeline.currentEpoch

		clock.advance(1_000)
		// The listener jumps to the middle. As a fraction the move is 0.4, which
		// could never clear a threshold measured in seconds.
		timeline.update(status({ playback: { position: 0.5, time: 117, duration: 233, rate: 1 } }))

		expect(timeline.currentEpoch).toBe(before + 1)
	})
})
