import { describe, expect, it } from "vitest"
import { detectVideoStream } from "./vlc.mapper"

describe("detectVideoStream", () => {
	it("finds a video stream by its resolution value, in any language", () => {
		const result = detectVideoStream({
			meta: { title: "should be skipped" },
			"Emisión 0": { Tipo: "Vídeo", Resolución_de_vídeo: "1280x720" },
		})

		expect(result).toEqual({ isVideo: true, videoInfo: { width: 1280, height: 720 } })
	})

	it("reports audio when no stream value looks like a resolution", () => {
		const result = detectVideoStream({
			meta: { title: "song" },
			"Stream 0": { Type: "Audio", Sample_rate: "44100 Hz" },
		})

		expect(result).toEqual({ isVideo: false, videoInfo: undefined })
	})

	it("does not mistake embedded cover art for a video stream", () => {
		// Cover art is exposed as meta.artwork_url, never as its own stream, but
		// this guards the assumption explicitly since it is the one case that
		// could produce a false positive.
		const result = detectVideoStream({
			meta: { title: "song", artwork_url: "file:///art.png" },
			"Stream 0": { Type: "Audio" },
		})

		expect(result.isVideo).toBe(false)
	})

	it("ignores an empty category", () => {
		expect(detectVideoStream({})).toEqual({ isVideo: false })
	})
})
