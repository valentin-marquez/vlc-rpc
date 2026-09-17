import type { DiscordPresenceData, LastSentPresence } from "@shared/presence/presence.types"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PreviewSample } from "./layout.constants"
import { EXAMPLE_BADGE, cardDressing } from "./layout.mapper"

const PAUSED_KEY = "paused"

const LIVE: PreviewSample = {
	id: "track",
	label: "What is playing",
	inSentence: "what is playing",
	isLive: true,
	variables: { title: "Made My Night", artist: "LE SSERAFIM", album: "EASY" },
}

const EXAMPLE: PreviewSample = {
	id: "untagged",
	label: "A file with no tags",
	inSentence: "a file with no tags",
	isLive: false,
	variables: { title: "track01", artist: "", album: "" },
}

const PLAYING_AUDIO: DiscordPresenceData = {
	details: "Made My Night",
	state: "by LE SSERAFIM",
	large_image: "https://example.invalid/cover.jpg",
	large_text: "EASY",
	small_image: "playing",
	small_text: "Playing",
	start_timestamp: 1_700_000_000,
	end_timestamp: 1_700_000_245,
	activity_type: 2,
}

// Paused playback sends no timestamps at all, which is why there is no bar to pause.
const PAUSED_AUDIO: DiscordPresenceData = {
	details: "Made My Night",
	state: "by LE SSERAFIM",
	large_image: "https://example.invalid/cover.jpg",
	small_image: PAUSED_KEY,
	small_text: "Paused",
	activity_type: 2,
}

function sent(presence: DiscordPresenceData): LastSentPresence {
	return { kind: "sent", presence, sentAt: 1_700_000_100_000, applicationName: "VLC" }
}

describe("cardDressing", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("dresses the live card off the presence that was actually sent", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1_700_000_100_000)

		expect(cardDressing(LIVE, sent(PLAYING_AUDIO), PAUSED_KEY)).toEqual({
			badge: { kind: "playing", text: "Playing" },
			largeImage: "https://example.invalid/cover.jpg",
			progress: { elapsedSeconds: 100, durationSeconds: 245 },
		})
	})

	it("draws a paused file paused, and draws it no times", () => {
		const dressing = cardDressing(LIVE, sent(PAUSED_AUDIO), PAUSED_KEY)

		expect(dressing.badge).toEqual({ kind: "paused", text: "Paused" })
		expect(dressing.progress).toBeUndefined()
	})

	it("carries the hover text Discord shows, resolution and all", () => {
		const video = sent({ small_image: "playing", small_text: "Playing, 1920x1080" })

		expect(cardDressing(LIVE, video, PAUSED_KEY).badge).toEqual({
			kind: "playing",
			text: "Playing, 1920x1080",
		})
	})

	it("hands over whatever the presence named its image, address or asset key", () => {
		expect(cardDressing(LIVE, sent({ large_image: "vlc" }), PAUSED_KEY).largeImage).toBe("vlc")
	})

	it("has no badge to draw when the presence sent no small image", () => {
		expect(cardDressing(LIVE, sent({ details: "Made My Night" }), PAUSED_KEY).badge).toBeUndefined()
	})

	it("never lets an example claim to be the file on Discord", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1_700_000_100_000)

		expect(cardDressing(EXAMPLE, sent(PLAYING_AUDIO), PAUSED_KEY)).toEqual({
			badge: EXAMPLE_BADGE,
		})
	})

	it("says nothing about hover text for an example, which has none to say", () => {
		expect(EXAMPLE_BADGE.text).toBeUndefined()
	})

	it("falls back to an example when nothing is on Discord to read", () => {
		expect(cardDressing(LIVE, { kind: "cleared", reason: "rpc-disabled" }, PAUSED_KEY)).toEqual({
			badge: EXAMPLE_BADGE,
		})
		expect(cardDressing(LIVE, { kind: "unknown" }, PAUSED_KEY)).toEqual({ badge: EXAMPLE_BADGE })
	})

	it("dresses a card with no sample as an example", () => {
		expect(cardDressing(undefined, sent(PLAYING_AUDIO), PAUSED_KEY)).toEqual({
			badge: EXAMPLE_BADGE,
		})
	})
})
