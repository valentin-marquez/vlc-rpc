import { join } from "node:path"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { Identifier } from "./music.identify"
import type {
	AudioFileIdentity,
	AudioFingerprinter,
	AudioIdLookup,
	FileLocator,
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

function fakeLocator(file: AudioFileIdentity | null) {
	const calls = { asked: 0 }
	const locator: FileLocator = {
		fileFor: async () => {
			calls.asked++
			return file
		},
	}
	return { locator, calls }
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
		const { locator, calls } = fakeLocator(FILE)
		const { fingerprinter } = fakeFingerprinter({ kind: "absent" }, false)
		const identifier = new Identifier(
			locator,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toBeNull()
		expect(calls.asked).toBe(0)
	})

	it("hands back the file the locator found", async () => {
		const { locator } = fakeLocator(FILE)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			locator,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toEqual(FILE)
	})

	it("has no file when VLC is playing something that is not a file on disk", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const identifier = new Identifier(
			locator,
			fingerprinter,
			fakeLookup({ kind: "matched", matches: [] }).lookup,
		)

		expect(await identifier.fileFor(status(1))).toBeNull()
	})
})

describe("Identifier.identify", () => {
	it("identifies the recording and credits the fingerprint as the provider", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter, asked } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

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
			name: { title: "Probablemente", artist: "Christian Nodal" },
		})
	})

	it("carries no name for a match that only cleared the cover floor", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match({ score: 0.91 })] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(outcome.kind).toBe("identified")
		expect(outcome.kind === "identified" && outcome.name).toBeNull()
	})

	it("carries no name when the match credits nobody", async () => {
		// Half a name is not a name: replacing the file's own words with a title
		// and a blank credit reads as a song nobody recorded.
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match({ artists: [] })] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(outcome.kind === "identified" && outcome.name).toBeNull()
	})

	it("joins a credit of several names into the one the presence reads", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({
			kind: "matched",
			matches: [match({ artists: ["Christian Nodal", "David Bisbal"] })],
		})
		const identifier = new Identifier(locator, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(outcome.kind === "identified" && outcome.name?.artist).toBe(
			"Christian Nodal, David Bisbal",
		)
	})

	it("does not spend a lookup when the audio could not be fingerprinted", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter({ kind: "failed" })
		const { lookup, calls } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		const outcome = await identifier.identify(FILE)

		expect(outcome).toEqual({ kind: "unidentified", reason: "no-results" })
		expect(calls.lookup).toBe(0)
	})

	it("does not hash the file while the lookup is holding off", async () => {
		// The poll loop asks again every 1.5 seconds and the cooldown lasts a
		// minute, so fingerprinting first would spawn fpcalc some forty times over
		// audio that nothing is going to be asked about.
		const { locator } = fakeLocator(null)
		const { fingerprinter, asked } = fakeFingerprinter(FINGERPRINTED)
		const { lookup, calls } = fakeLookup({ kind: "matched", matches: [match()] }, false)
		const identifier = new Identifier(locator, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
		expect(asked).toEqual([])
		expect(calls.lookup).toBe(0)
	})

	it("reports a missing binary as unavailable rather than as unknown audio", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter({ kind: "absent" }, false)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match()] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
	})

	it("passes a service that could not answer through as unavailable", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "unavailable" })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unavailable" })
	})

	it("reports audio the service does not know as unidentified", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unidentified", reason: "no-results" })
	})

	it("reports matches the policy turns down as unidentified, not as an answer", async () => {
		const { locator } = fakeLocator(null)
		const { fingerprinter } = fakeFingerprinter(FINGERPRINTED)
		const { lookup } = fakeLookup({ kind: "matched", matches: [match({ score: 0.7 })] })
		const identifier = new Identifier(locator, fingerprinter, lookup)

		expect(await identifier.identify(FILE)).toEqual({ kind: "unidentified", reason: "no-match" })
	})
})
