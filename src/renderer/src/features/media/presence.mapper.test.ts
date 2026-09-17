import type { DiscordPresenceData } from "@shared/presence/presence.types"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	activityHeader,
	activityVerb,
	presenceBadge,
	presenceContent,
	presenceProgress,
} from "./presence.mapper"

const AUDIO: DiscordPresenceData = {
	details: "Made My Night",
	state: "by LE SSERAFIM",
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
	small_image: "playing",
	small_text: "Playing, 1920x1080",
	activity_type: 3,
}

describe("activityVerb", () => {
	it("gives the word the header opens with", () => {
		expect(activityVerb(2)).toBe("Listening")
		expect(activityVerb(3)).toBe("Watching")
	})

	it("falls back to playing for an activity type the app never sends", () => {
		expect(activityVerb(undefined)).toBe("Playing")
		expect(activityVerb(0)).toBe("Playing")
	})
})

describe("activityHeader", () => {
	it("writes the name on the header line, after the verb", () => {
		expect(activityHeader("Listening", "VLC")).toBe("Listening to VLC")
		expect(activityHeader("Watching", "VLC")).toBe("Watching VLC")
	})

	it("writes the verb alone rather than guess a name Discord has not given", () => {
		expect(activityHeader("Listening", null)).toBe("Listening")
		expect(activityHeader("Watching", "")).toBe("Watching")
	})
})

describe("presenceContent", () => {
	it("lays an audio activity out the way Discord draws it", () => {
		const content = presenceContent(AUDIO, "paused", "VLC")

		expect(content.header).toBe("Listening to VLC")
		expect(content.details).toBe("Made My Night")
		expect(content.state).toBe("by LE SSERAFIM")
		expect(content.largeText).toBe("EASY")
	})

	it("puts the name the app sent on the header line, where Discord puts it", () => {
		const content = presenceContent({ ...AUDIO, name: "Blue Rev" }, "paused", "VLC")

		expect(content.header).toBe("Listening to Blue Rev")
	})

	it("draws a video activity with two lines and the app's name in the header", () => {
		const content = presenceContent(VIDEO, "paused", "VLC")

		expect(content.header).toBe("Watching VLC")
		expect(content.details).toBe("Sousou no Frieren")
		expect(content.state).toBe("Season 1, episode 11")
		expect("largeText" in content).toBe(false)
	})

	it("drops a line the templates could not fill", () => {
		const content = presenceContent({ activity_type: 2, details: "", state: "" }, "paused", null)

		expect("details" in content).toBe(false)
		expect("state" in content).toBe(false)
		expect("largeText" in content).toBe(false)
	})

	it("stands the artwork placeholder in for the kind of media playing", () => {
		expect(presenceContent(AUDIO, "paused", null).icon).toBe("music")
		expect(presenceContent(VIDEO, "paused", null).icon).toBe("video")
	})
})

/**
 * The reading the preview used to get wrong. These are the exact fields the app sent for a
 * file identified by its sound, with no album, and the lines beside them are the ones
 * Discord drew from them on a real profile, in that order.
 */
describe("the presence Discord was measured drawing", () => {
	it("maps the fields to the lines the profile showed", () => {
		const sent: DiscordPresenceData = {
			name: "Probablemente",
			details: "by Christian Nodal",
			state: "",
			large_text: "Listening to Music",
			large_image: "https://example.invalid/cover.jpg",
			small_image: "playing",
			small_text: "Playing",
			start_timestamp: 1_700_000_000,
			end_timestamp: 1_700_000_233,
			activity_type: 2,
		}

		const content = presenceContent(sent, "paused", "VLC")

		expect(content.header).toBe("Listening to Probablemente")
		expect(content.details).toBe("by Christian Nodal")
		expect("state" in content).toBe(false)
		expect(content.largeText).toBe("Listening to Music")
	})

	it("draws the same file the way the arrangement it shipped with sends it now", () => {
		const content = presenceContent(
			{
				details: "Probablemente",
				state: "by Christian Nodal",
				small_image: "playing",
				activity_type: 2,
			},
			"paused",
			"VLC",
		)

		expect(content.header).toBe("Listening to VLC")
		expect(content.details).toBe("Probablemente")
		expect(content.state).toBe("by Christian Nodal")
		expect("largeText" in content).toBe(false)
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
