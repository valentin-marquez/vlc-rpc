import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const logged: string[] = []

vi.mock("@main/core/logger", () => ({
	logger: {
		info: (message: string) => logged.push(message),
		warn: (message: string) => logged.push(message),
		error: (message: string) => logged.push(message),
		debug: (message: string) => logged.push(message),
	},
}))

import { AcoustId } from "./music.acoustid"

const KEY = "test-client-key"
const FINGERPRINT = "AQADtMqSJMlKKci4Qz3aww8"
const DURATION = 232.97

/** The recording the validated capture identifies, solo, at 0.9588937. */
const SOLO_MBID = "097cfb49-419c-4b00-97f3-cc86ef4d77c2"
const DUET_MBID = "0a25e4b3-fdf1-4c20-917b-6721a744cfbc"
/** The studio album, which the response does not return first. */
const STUDIO_ALBUM_MBID = "1f9763bf-5ebf-4ecc-b5aa-4d462df0e20a"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string, status = 200): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: status < 400, status, json: async () => JSON.parse(body) })),
	)
}

function sentBody(): URLSearchParams {
	const init = vi.mocked(fetch).mock.calls[0]?.[1]
	return new URLSearchParams(String(init?.body ?? ""))
}

afterEach(() => {
	vi.unstubAllGlobals()
	logged.length = 0
})

describe("AcoustId.lookup", () => {
	it("posts the fingerprint as a form body, keeping the key out of the url", async () => {
		respondWith(fixture("acoustid-lookup-response"))

		await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
		expect(url).toBe("https://api.acoustid.org/v2/lookup")
		expect(init?.method).toBe("POST")
		expect(String(url)).not.toContain(KEY)
		expect(sentBody().get("client")).toBe(KEY)
		expect(sentBody().get("fingerprint")).toBe(FINGERPRINT)
	})

	it("rounds the duration, which the service wants as whole seconds", async () => {
		respondWith(fixture("acoustid-lookup-response"))

		await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(sentBody().get("duration")).toBe("233")
	})

	it("separates the meta values with a space, never with a plus", async () => {
		// Measured: a literal plus arrives percent encoded and the service answers
		// ok with no recordings at all, which reads as unknown audio and is not.
		respondWith(fixture("acoustid-lookup-response"))

		await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		const raw = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body ?? "")
		expect(sentBody().get("meta")).toBe("recordings releasegroups")
		expect(raw).toContain("meta=recordings+releasegroups")
		expect(raw).not.toContain("%2B")
	})

	it("flattens the captured response into one match per recording", async () => {
		respondWith(fixture("acoustid-lookup-response"))

		const outcome = await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(outcome.kind).toBe("matched")
		if (outcome.kind !== "matched") return
		expect(outcome.matches.map((match) => match.id)).toEqual([SOLO_MBID, DUET_MBID])
		expect(outcome.matches[0]?.score).toBeCloseTo(0.9588937, 6)
		expect(outcome.matches[0]?.artists).toEqual(["Christian Nodal"])
		expect(outcome.matches[1]?.artists).toEqual(["Christian Nodal", "David Bisbal"])
		expect(outcome.matches[1]?.score).toBeCloseTo(0.85508966, 6)
	})

	it("puts the studio album ahead of the compilations the response returns first", async () => {
		// The capture returns "Duelo romántico", a compilation, at index 0. Taking
		// the response order would show a greatest hits cover for a correct
		// identification, which is the worst failure this feature can produce.
		const returned = JSON.parse(fixture("acoustid-lookup-response"))
		expect(returned.results[0].recordings[0].releasegroups[0].title).toBe("Duelo romántico")
		respondWith(fixture("acoustid-lookup-response"))

		const outcome = await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(outcome.kind).toBe("matched")
		if (outcome.kind !== "matched") return
		expect(outcome.matches[0]?.releases[0]).toEqual({
			title: "Me dejé llevar",
			releaseGroupId: STUDIO_ALBUM_MBID,
		})
	})

	it("answers with an empty list when the service knows nothing about the audio", async () => {
		respondWith('{"status":"ok","results":[]}')

		const outcome = await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(outcome).toEqual({ kind: "matched", matches: [] })
	})

	it("ignores a result that arrives with no recordings at all", async () => {
		respondWith('{"status":"ok","results":[{"id":"x","score":0.99}]}')

		const outcome = await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(outcome).toEqual({ kind: "matched", matches: [] })
	})

	it("stops asking once the service rejects the configured key", async () => {
		// Code 4 is a configuration problem, not a data problem: every later
		// request would be rejected the same way and the limit is shared by
		// every user of the application.
		respondWith('{"status":"error","error":{"code":4,"message":"invalid API key"}}')
		const acoustid = new AcoustId(KEY)

		expect(await acoustid.lookup(FINGERPRINT, DURATION)).toEqual({ kind: "unavailable" })
		expect(await acoustid.lookup(FINGERPRINT, DURATION)).toEqual({ kind: "unavailable" })

		expect(vi.mocked(fetch).mock.calls.length).toBe(1)
	})

	it("never writes the key to the log, not even when the key is what failed", async () => {
		respondWith('{"status":"error","error":{"code":4,"message":"invalid API key"}}')

		await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(logged.length).toBeGreaterThan(0)
		expect(logged.some((line) => line.includes(KEY))).toBe(false)
	})

	it("treats a rejected fingerprint as a fact about the file, not about the service", async () => {
		// Code 3 means this audio will be rejected the same way on every retry,
		// so it answers as a completed lookup with nothing found.
		respondWith('{"status":"error","error":{"code":3,"message":"invalid fingerprint"}}')

		const outcome = await new AcoustId(KEY).lookup(FINGERPRINT, DURATION)

		expect(outcome).toEqual({ kind: "matched", matches: [] })
	})

	it("holds off after a failed request instead of spending the shared limit", async () => {
		respondWith('{"status":"error"}', 503)
		const acoustid = new AcoustId(KEY)

		expect(await acoustid.lookup(FINGERPRINT, DURATION)).toEqual({ kind: "unavailable" })
		expect(await acoustid.lookup(FINGERPRINT, DURATION)).toEqual({ kind: "unavailable" })

		expect(vi.mocked(fetch).mock.calls.length).toBe(1)
	})
})
