import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) =>
			key === "vlc" ? { httpPort: 9080, httpPassword: "secret", httpEnabled: true } : {},
		set: () => {},
		delete: () => {},
	},
}))

// vi.mock se hoistea por encima de los imports, asi que este import normal
// ya recibe los modulos mockeados.
import { vlcStatusService } from "./vlc.client"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

function respondWith(body: string, status = 200): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ status, text: async () => body })),
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
})

// Characterization tests. Every fixture is a real capture from a Spanish
// language VLC, which is the point: see the mediaType test below.

describe("readStatus", () => {
	it("maps an untagged mp3 using the filename as the title", async () => {
		respondWith(fixture("audio-untagged.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status).not.toBeNull()
		expect(status?.active).toBe(true)
		expect(status?.status).toBe("playing")
		expect(status?.mediaType).toBe("audio")
		expect(status?.media.title).toBe("Christian Nodal - Probablemente (Official Lyric Video).mp3")
		expect(status?.media.artist).toBe("")
		expect(status?.media.album).toBe("")
		expect(status?.media.artworkUrl).toBeUndefined()
		expect(status?.playback.time).toBe(42)
		expect(status?.playback.duration).toBe(233)
		expect(status?.playback.position).toBeCloseTo(0.1802, 4)
	})

	it("prefers the title VLC derived over the raw filename", async () => {
		respondWith(fixture("video-tv-show.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.media.title).toBe("Some Show S01E03")
	})

	it("reports paused without losing the media info", async () => {
		respondWith(fixture("paused.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.active).toBe(true)
		expect(status?.status).toBe("paused")
		expect(status?.playback.time).toBe(30)
	})

	it("returns null when VLC answers with a non 200", async () => {
		respondWith("", 404)
		expect(await vlcStatusService.readStatus(true)).toBeNull()
	})

	it("returns the cached status when the payload hash is unchanged", async () => {
		respondWith(fixture("audio-no-art.status"))
		const first = await vlcStatusService.readStatus(true)
		const second = await vlcStatusService.readStatus(false)

		expect(second).toBe(first)
	})
})

describe("media type detection", () => {
	// All three fixtures are real video files captured from a Spanish VLC,
	// where information.category uses "Tipo": "Vídeo", not "Type": "Video".
	// Detection matches by the resolution value's shape instead, so it holds
	// regardless of VLC's interface language. See vlc.mapper.ts.
	it.each([
		["video-tv-show", 1280, 720],
		["video-movie", 1280, 720],
		["video-anime", 1280, 720],
	])("detects %s as video with its resolution", async (name, width, height) => {
		respondWith(fixture(`${name}.status`))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.mediaType).toBe("video")
		expect(status?.videoInfo).toEqual({ width, height })
	})

	it("detects untagged and embedded art audio as audio, with no videoInfo", async () => {
		for (const name of ["audio-no-art", "audio-embedded-art"]) {
			respondWith(fixture(`${name}.status`))
			const status = await vlcStatusService.readStatus(true)

			expect(status?.mediaType).toBe("audio")
			expect(status?.videoInfo).toBeUndefined()
		}
	})
})

describe("getCurrentFileUri", () => {
	it("finds the item flagged as current, however deep it is nested", async () => {
		respondWith(fixture("video-tv-show.playlist"))
		const uri = await vlcStatusService.getCurrentFileUri()

		expect(uri).toMatch(/^file:\/\/\//)
		expect(uri).toContain("Some.Show.S01E03.1080p.WEB-DL.mp4")
	})

	it("returns null when nothing is playing", async () => {
		respondWith(JSON.stringify({ ro: "rw", type: "node", name: "Playlist", id: "0" }))
		expect(await vlcStatusService.getCurrentFileUri()).toBeNull()
	})
})
