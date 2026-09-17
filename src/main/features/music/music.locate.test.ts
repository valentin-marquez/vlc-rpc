import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { Locator, type PlayingFile } from "./music.locate"

const THIS_FILE = join(__dirname, "music.locate.test.ts")

function status(plid: number | null, media: { title?: string; duration?: number } = {}): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid,
		playback: { position: 0, time: 0, duration: media.duration ?? 232, rate: 1 },
		mediaType: "audio",
		media: { title: media.title ?? "Unknown", artist: "", album: "" },
	}
}

function fakePlaying(uri: string | null) {
	const calls = { asked: 0 }
	const playing: PlayingFile = {
		getCurrentFileUri: async () => {
			calls.asked++
			return uri
		},
	}
	return { playing, calls }
}

describe("Locator", () => {
	it("turns the playing uri into a path and measures the file behind it", async () => {
		const { playing } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const locator = new Locator(playing)

		const file = await locator.fileFor(status(1))

		expect(file?.path).toBe(THIS_FILE)
		expect(file?.size).toBeGreaterThan(0)
		expect(file?.modifiedAt).toBeGreaterThan(0)
	})

	it("asks VLC once per playlist item, not once per poll", async () => {
		// The presence loop resolves every 1.5 seconds and the playlist is an
		// http round trip, so a second question about the same item is waste.
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const locator = new Locator(playing)

		await locator.fileFor(status(7))
		await locator.fileFor(status(7))
		expect(calls.asked).toBe(1)

		await locator.fileFor(status(8))
		expect(calls.asked).toBe(2)
	})

	it("asks again when the playlist id repeats for a different file", async () => {
		// VLC numbers playlist items per process, so quitting and reopening it
		// hands a fresh file the same low id. Answering from the memo there
		// serves the previous file's cover, and on this path neither file has a
		// tag that could contradict it.
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const locator = new Locator(playing)

		await locator.fileFor(status(3, { title: "first.mp3", duration: 232 }))
		expect(calls.asked).toBe(1)

		await locator.fileFor(status(3, { title: "second.mp3", duration: 190 }))
		expect(calls.asked).toBe(2)
	})

	it("asks again for every poll when VLC reports no playlist item", async () => {
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const locator = new Locator(playing)

		await locator.fileFor(status(null))
		await locator.fileFor(status(null))

		expect(calls.asked).toBe(2)
	})

	it("has no file for a stream", async () => {
		const { playing } = fakePlaying("https://radio.example.com/live.mp3")
		const locator = new Locator(playing)

		expect(await locator.fileFor(status(1))).toBeNull()
	})

	it("has no file when the path VLC reports is gone", async () => {
		const { playing } = fakePlaying(pathToFileURL(join(__dirname, "no-such-track.mp3")).href)
		const locator = new Locator(playing)

		expect(await locator.fileFor(status(1))).toBeNull()
	})

	it("has no file when VLC names no playing item at all", async () => {
		const { playing } = fakePlaying(null)
		const locator = new Locator(playing)

		expect(await locator.fileFor(status(1))).toBeNull()
	})
})
