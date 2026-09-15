import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

// vi.mock is hoisted above regular declarations, so the mutable config the
// factory closes over has to be created through vi.hoisted to exist in time.
const { mockVlcConfig } = vi.hoisted(() => ({
	mockVlcConfig: { httpPort: 9080, httpPassword: "secret", httpEnabled: true },
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => (key === "vlc" ? mockVlcConfig : {}),
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
	mockVlcConfig.httpEnabled = true
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

	it("handles a stream with no known duration", async () => {
		// length: 0 from VLC, distinct from the -1 a VBR file with no Xing
		// header reports (see the untagged mp3 fixture). Both mean "no bar",
		// but for different reasons: this one never has a duration to report.
		respondWith(fixture("stream-no-duration.status"))
		const status = await vlcStatusService.readStatus(true)

		expect(status?.active).toBe(true)
		expect(status?.mediaType).toBe("audio")
		expect(status?.playback.duration).toBe(0)
		expect(status?.playback.time).toBe(0)
		expect(status?.media.title).toContain("Groove Salad")
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

describe("checkVlcStatus", () => {
	it("reports not-configured without making a request when httpEnabled is false", async () => {
		mockVlcConfig.httpEnabled = false
		const fetchSpy = vi.fn()
		vi.stubGlobal("fetch", fetchSpy)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status).toEqual({
			isRunning: false,
			reason: "not-configured",
			message: "VLC HTTP interface is not enabled in configuration",
		})
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("reports running on a 200", async () => {
		respondWith("{}")
		const status = await vlcStatusService.checkVlcStatus()

		expect(status.isRunning).toBe(true)
		expect(status.reason).toBe("running")
	})

	it.each([
		[401, "auth-failed"],
		[404, "misconfigured-endpoint"],
		[500, "unexpected-status"],
	])("reports %s as %s", async (httpStatus, reason) => {
		respondWith("", httpStatus)
		const status = await vlcStatusService.checkVlcStatus()

		expect(status.isRunning).toBe(false)
		expect(status.reason).toBe(reason)
	})

	it("reports not-running when the connection is refused", async () => {
		const refused = Object.assign(new Error("connect ECONNREFUSED"), {
			name: "Error",
			code: "ECONNREFUSED",
		})
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw refused
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("not-running")
	})

	it("reports timeout on an aborted request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw Object.assign(new Error("aborted"), { name: "AbortError" })
			}),
		)

		const status = await vlcStatusService.checkVlcStatus()

		expect(status.reason).toBe("timeout")
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

	it("returns a stream URL as is, not just file:// paths", async () => {
		respondWith(fixture("stream-no-duration.playlist"))
		const uri = await vlcStatusService.getCurrentFileUri()

		expect(uri).toBe("http://ice1.somafm.com/groovesalad-128-mp3")
	})
})
