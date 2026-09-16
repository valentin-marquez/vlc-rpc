import type { Resolver as CatalogResolver } from "@main/features/catalog"
import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { Client as VlcClient } from "@main/features/vlc"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

import { Resolver as ArtworkResolver } from "@main/features/artwork"
import { MediaInfoHandler } from "./media.handler"
import type { ImageProxy } from "./media.image-proxy"

const LOCAL_ARTWORK = "file:///C:/music/track.jpg"
const PUBLISHED_COVER = "https://uploads.example/local.jpg"
const CATALOG_COVER = "https://catalog.example/cover.jpg"

const catalogHit: MusicResult = { cover: CATALOG_COVER, provider: "itunes", id: "42" }

function status(artworkUrl?: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 30, time: 30, duration: 210, rate: 1 },
		mediaType: "audio",
		media: {
			title: "Probablemente",
			artist: "Christina Aguilera",
			album: "Mi Reflejo",
			artworkUrl,
		},
	}
}

function build(outcome: CoverOutcome, result: MusicResult | null = catalogHit) {
	const calls = { fetch: 0, resolve: 0 }
	const artwork = new ArtworkResolver(
		{
			fetch: async () => {
				calls.fetch++
				return outcome
			},
		},
		{
			resolve: async () => {
				calls.resolve++
				return result
			},
		},
	)
	const catalog = {
		resolve: async () => {
			throw new Error("the video catalog must not be consulted for audio")
		},
	} as unknown as CatalogResolver
	const vlc = { readStatus: async () => null } as unknown as VlcClient
	// Null keeps every URL as it was resolved, so the assertions read the
	// decision under test rather than a data URL.
	const imageProxy = { getImageAsDataUrl: async () => null } as unknown as ImageProxy

	return { handler: new MediaInfoHandler(artwork, catalog, vlc, imageProxy), calls }
}

describe("MediaInfoHandler audio artwork", () => {
	it("reports the published artwork and consults no catalog", async () => {
		const { handler, calls } = build({ kind: "published", url: PUBLISHED_COVER })

		const info = await handler.getMediaInfo(status(LOCAL_ARTWORK))

		expect(info?.content_image_url).toBe(PUBLISHED_COVER)
		expect(calls.resolve).toBe(0)
	})

	it("reports a catalog cover when the file carries no artwork", async () => {
		const { handler, calls } = build({ kind: "no-artwork" })

		const info = await handler.getMediaInfo(status())

		expect(info?.content_image_url).toBe(CATALOG_COVER)
		expect(calls.resolve).toBe(1)
	})

	it("consults no catalog when the file has artwork that failed to publish", async () => {
		const { handler, calls } = build({ kind: "publish-failed" })

		const info = await handler.getMediaInfo(status(LOCAL_ARTWORK))

		expect(calls.resolve).toBe(0)
		expect(info?.content_image_url).toBeUndefined()
	})
})
