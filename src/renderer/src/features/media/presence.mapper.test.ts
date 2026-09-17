import type { DiscordPresenceData } from "@shared/presence/presence.types"
import { afterEach, describe, expect, it, vi } from "vitest"

import { activityVerb, presenceBadge, presenceContent, presenceProgress } from "./presence.mapper"

const AUDIO: DiscordPresenceData = {
	name: "LE SSERAFIM",
	details: "Made My Night by LE SSERAFIM",
	state: "Listening to Music",
	large_image: "https://example.invalid/cover.jpg",
	large_text: "EASY",
	small_image: "playing",
	small_text: "Playing",
	activity_type: 2,
}

const VIDEO: DiscordPresenceData = {
	details: "Sousou no Frieren",
	state: "Season 1, episode 11",
	large_image: "vlc",
	large_text: "Watching Video",
	small_image: "playing",
	small_text: "Playing, 1920x1080",
	activity_type: 3,
}

describe("activityVerb", () => {
	it("gives the verb alone, never the name after it", () => {
		expect(activityVerb(2)).toBe("Listening")
		expect(activityVerb(3)).toBe("Watching")
	})

	it("falls back to playing for an activity type the app never sends", () => {
		expect(activityVerb(undefined)).toBe("Playing")
		expect(activityVerb(0)).toBe("Playing")
	})
})

describe("presenceContent", () => {
	it("lays an audio activity out the way Discord draws it", () => {
		const content = presenceContent(AUDIO, "paused")

		expect(content.header).toBe("Listening")
		expect(content.name).toBe("LE SSERAFIM")
		expect(content.details).toBe("Made My Night by LE SSERAFIM")
		expect(content.state).toBe("Listening to Music")
	})

	it("leaves a video activity without a name line, since none was sent", () => {
		const content = presenceContent(VIDEO, "paused")

		expect(content.header).toBe("Watching")
		expect("name" in content).toBe(false)
		expect(content.details).toBe("Sousou no Frieren")
		expect(content.state).toBe("Season 1, episode 11")
	})

	it("keeps large_text off the body, where Discord never draws it", () => {
		const content = presenceContent(
			{ name: "LE SSERAFIM", details: "Made My Night", large_text: "EASY", activity_type: 2 },
			"paused",
		)

		expect(content.largeText).toBe("EASY")
		expect("state" in content).toBe(false)
	})

	it("drops a line the templates could not fill", () => {
		const content = presenceContent({ activity_type: 2, details: "", state: "" }, "paused")

		expect("details" in content).toBe(false)
		expect("state" in content).toBe(false)
	})

	it("stands the artwork placeholder in for the kind of media playing", () => {
		expect(presenceContent(AUDIO, "paused").icon).toBe("music")
		expect(presenceContent(VIDEO, "paused").icon).toBe("video")
	})
})

describe("presenceBadge", () => {
	it("reads the paused key back against the one the loop sends", () => {
		expect(presenceBadge({ small_image: "paused", small_text: "Paused" }, "paused")).toEqual({
			kind: "paused",
			text: "Paused",
		})
	})

	it("treats every other key as playing", () => {
		expect(presenceBadge({ small_image: "playing" }, "paused")).toEqual({
			kind: "playing",
			text: undefined,
		})
	})

	it("has nothing to draw when no small image was sent", () => {
		expect(presenceBadge({ activity_type: 2 }, "paused")).toBeNull()
	})
})

describe("presenceProgress", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("measures elapsed time against the viewer's own clock", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1_700_000_100_000)

		expect(
			presenceProgress({ start_timestamp: 1_700_000_000, end_timestamp: 1_700_000_245 }),
		).toEqual({ elapsedSeconds: 100, durationSeconds: 245 })
	})

	it("never runs past the end of the track", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1_700_001_000_000)

		expect(
			presenceProgress({ start_timestamp: 1_700_000_000, end_timestamp: 1_700_000_245 }),
		).toEqual({ elapsedSeconds: 245, durationSeconds: 245 })
	})

	it("has no bar for a paused file, which carries no timestamps", () => {
		expect(presenceProgress({ activity_type: 2 })).toBeNull()
	})

	it("has no bar for a stream whose end is not after its start", () => {
		expect(
			presenceProgress({ start_timestamp: 1_700_000_000, end_timestamp: 1_700_000_000 }),
		).toBeNull()
	})
})
