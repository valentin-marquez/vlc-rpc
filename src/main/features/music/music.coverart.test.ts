import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { CoverArtArchive } from "./music.coverart"
import type { CandidateRelease } from "./music.types"

const RELEASE_FIXTURE = "coverart-release-response.json"
const NOT_FOUND_FIXTURE = "coverart-not-found-response.html"

const RELEASE: CandidateRelease = {
	id: "40c32a0e-37b3-4bc3-9570-b1d8eddd7153",
	title: "Me dejé llevar",
	releaseGroupId: "1f9763bf-5ebf-4ecc-b5aa-4d462df0e20a",
}

const FRONT_500 =
	"https://coverartarchive.org/release/40c32a0e-37b3-4bc3-9570-b1d8eddd7153/41178608899-500.jpg"

const REQUEST_TIMEOUT_MS = 5000

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", name), "utf-8")
}

function okResponse(body: string) {
	return { ok: true, status: 200, json: async () => JSON.parse(body) }
}

// The archive answers 404 with an html body, so anything that reads the body
// before checking the status fails here exactly as it would against the service.
function notFoundResponse() {
	return { ok: false, status: 404, json: async () => JSON.parse(fixture(NOT_FOUND_FIXTURE)) }
}

function withNothingMarkedFront(): string {
	const body = JSON.parse(fixture(RELEASE_FIXTURE))
	body.images = body.images.map((image: { front: boolean }) => ({ ...image, front: false }))
	return JSON.stringify(body)
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("CoverArtArchive", () => {
	it("returns the 500 thumbnail of the image marked front, not the first image", async () => {
		// The real capture had the front image at index 0. It was moved in the
		// stored fixture so a naive images[0] cannot pass this by accident.
		const images = JSON.parse(fixture(RELEASE_FIXTURE)).images
		expect(images[0].front).toBe(false)
		expect(images.findIndex((image: { front: boolean }) => image.front)).toBeGreaterThan(0)

		const fetchMock = vi.fn(async () => okResponse(fixture(RELEASE_FIXTURE)))
		vi.stubGlobal("fetch", fetchMock)

		const cover = await new CoverArtArchive().coverFor(RELEASE)

		expect(cover).toBe(FRONT_500)
		// The release answered, so the release group is never asked.
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it("returns null without throwing when the archive has no item for the release", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => notFoundResponse()),
		)

		const cover = await new CoverArtArchive().coverFor({ id: RELEASE.id, title: RELEASE.title })

		expect(cover).toBeNull()
	})

	it("returns null when the response has images but none marked front", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => okResponse(withNothingMarkedFront())),
		)

		const cover = await new CoverArtArchive().coverFor({ id: RELEASE.id, title: RELEASE.title })

		expect(cover).toBeNull()
	})

	it("throws on a 5xx, so a blip is not cached for a day as a missing cover", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 500 })),
		)

		await expect(new CoverArtArchive().coverFor(RELEASE)).rejects.toThrow("HTTP 500")
	})

	it("throws when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down")
			}),
		)

		await expect(new CoverArtArchive().coverFor(RELEASE)).rejects.toThrow("network down")
	})

	it("tries the release group after the release itself turns out to have no artwork", async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes("/release-group/") ? okResponse(fixture(RELEASE_FIXTURE)) : notFoundResponse(),
		)
		vi.stubGlobal("fetch", fetchMock)

		const cover = await new CoverArtArchive().coverFor(RELEASE)

		expect(cover).toBe(FRONT_500)
		const urls = fetchMock.mock.calls.map(([url]) => url)
		expect(urls).toEqual([
			`https://coverartarchive.org/release/${RELEASE.id}`,
			`https://coverartarchive.org/release-group/${RELEASE.releaseGroupId}`,
		])
	})

	it("arms an abort timer that covers reading the body, not just the headers", async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn(async (_url: string, init: { signal: AbortSignal }) => ({
			ok: true,
			status: 200,
			// A body that never arrives. Only a timer still running past the
			// headers can cut this off.
			json: () =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () => reject(new Error("aborted")))
				}),
		}))
		vi.stubGlobal("fetch", fetchMock)

		const pending = new CoverArtArchive().coverFor(RELEASE)
		const rejection = expect(pending).rejects.toThrow("aborted")

		expect(fetchMock.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)

		await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
		await rejection
	})
})
