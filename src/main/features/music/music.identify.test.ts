import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { Identifier, type PlayingFile } from "./music.identify"
import type {
	AudioFileIdentity,
	AudioFingerprinter,
	AudioIdLookup,
	FingerprintMatch,
	FingerprintOutcome,
	LookupOutcome,
} from "./music.types"

const THIS_FILE = join(__dirname, "music.identify.test.ts")

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

function fakeFingerprinter(outcome: FingerprintOutcome, available = true) {
	const asked: string[] = []
	const fingerprinter: AudioFingerprinter = {
		available,
		fingerprint: async (filePath: string) => {
			asked.push(filePath)
			return outcome
		},
	}
	return { fingerprinter, asked }
}

function fakeLookup(outcome: LookupOutcome, available = true) {
	const calls = { lookup: 0 }
	const lookup: AudioIdLookup = {
		available,
		lookup: async () => {
			calls.lookup++
			return outcome
		},
	}
	return { lookup, calls }
}

const FINGERPRINTED: FingerprintOutcome = {
	kind: "fingerprinted",
	fingerprint: "AQADtMqS",
	duration: 232.97,
}

function match(overrides: Partial<FingerprintMatch> = {}): FingerprintMatch {
	return {
		score: 0.96,
		id: "097cfb49-419c-4b00-97f3-cc86ef4d77c2",
		title: "Probablemente",
		artists: ["Christian Nodal"],
		releases: [{ title: "Me dejé llevar", releaseGroupId: "rg-1" }],
		rank: 0,
		...overrides,
	}
}

const FILE: AudioFileIdentity = { path: THIS_FILE, size: 100, modifiedAt: 1 }

describe("Identifier.fileFor", () => {
	it("asks nothing when this install has no fpcalc", async () => {
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const { fingerprinter } = fakeFingerprinter({ kind: "absent" }, false)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toBeNull()
		expect(calls.asked).toBe(0)
	})

	it("turns the playing uri into a path and measures the file behind it", async () => {
		const { playing } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		const file = await identifier.fileFor(status(1))

		expect(file?.path).toBe(THIS_FILE)
		expect(file?.size).toBeGreaterThan(0)
		expect(file?.modifiedAt).toBeGreaterThan(0)
	})

	it("asks VLC once per playlist item, not once per poll", async () => {
		// The presence loop resolves every 1.5 seconds and the playlist is an
		// http round trip, so a second question about the same item is waste.
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		await identifier.fileFor(status(7))
		await identifier.fileFor(status(7))
		expect(calls.asked).toBe(1)

		await identifier.fileFor(status(8))
		expect(calls.asked).toBe(2)
	})

	it("asks again when the playlist id repeats for a different file", async () => {
		// VLC numbers playlist items per process, so quitting and reopening it
		// hands a fresh file the same low id. Answering from the memo there
		// serves the previous file's cover, and on this path neither file has a
		// tag that could contradict it.
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		await identifier.fileFor(status(3, { title: "first.mp3", duration: 232 }))
		expect(calls.asked).toBe(1)

		await identifier.fileFor(status(3, { title: "second.mp3", duration: 190 }))
		expect(calls.asked).toBe(2)
	})

	it("asks again for every poll when VLC reports no playlist item", async () => {
		const { playing, calls } = fakePlaying(pathToFileURL(THIS_FILE).href)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		await identifier.fileFor(status(null))
		await identifier.fileFor(status(null))

		expect(calls.asked).toBe(2)
	})

	it("has no file for a stream", async () => {
		const { playing } = fakePlaying("https://radio.example.com/live.mp3")
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toBeNull()
	})

	it("has no file when the path VLC reports is gone", async () => {
		const { playing } = fakePlaying(pathToFileURL(join(__dirname, "no-such-track.mp3")).href)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			playing,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toBeNull()
	})
})

describe("Identifier.identify", () => {
	it("identifies the recording and credits the fingerprint as the provider", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter, asked } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(asked).toEqual([THIS_FILE])
		expect(outcome).toEqual({
			kind: "identified",
			recording: {
				provider: "acoustid",
				id: "097cfb49-419c-4b00-97f3-cc86ef4d77c2",
				title: "Probablemente",
				artists: ["Christian Nodal"],
				releases: [{ title: "Me dejé llevar", releaseGroupId: "rg-1" }],
				rank: 0,
			},
		})
	})

	it("does not spend a lookup when the audio could not be fingerprinted", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter } = fakeFingerprinter({ kind: "failed" })
		const { lookup, calls } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(outcome).toEqual({ kind: "unidentified", reason: "no-results" })
		expect(calls.lookup).toBe(0)
	})

	it("does not hash the file while the lookup is holding off", async () => {
		// The poll loop asks again every 1.5 seconds and the cooldown lasts a
		// minute, so fingerprinting first would spawn fpcalc some forty times over
		// audio that nothing is going to be asked about.
		const { playing } = fakePlaying(null)
		const { fingerprinter, asked } = fakeFingerprinter(FINGERPRINTED)
		const { lookup, calls } = fakeLookup({ kind: "matched", matches: [match()] }, false)
		const identifier = new Identifier(playing, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
		expect(asked).toEqual([])
		expect(calls.lookup).toBe(0)
	})

	it("reports a missing binary as unavailable rather than as unknown audio", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter } = fakeFingerprinter({ kind: "absent" }, false)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
	})

	it("passes a service that could not answer through as unavailable", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "unavailable" })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
	})

	it("reports audio the service does not know as unidentified", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [] })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unidentified", reason: "no-results" })
	})

	it("reports matches the policy turns down as unidentified, not as an answer", async () => {
		const { playing } = fakePlaying(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match({ score: 0.7 })] })
		const identifier = new Identifier(playing, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unidentified", reason: "no-match" })
	})
})
