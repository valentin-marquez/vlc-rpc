import type { Resolver as CatalogResolver, CatalogResult } from "@main/features/catalog"
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

describe("MediaInfoHandler audio content fields", () => {
	it("reports the audio kind and no metadata, the text comes from the tags", async () => {
		const { handler } = build({ kind: "published", url: PUBLISHED_COVER })

		const info = await handler.getMediaInfo(status(LOCAL_ARTWORK))

		expect(info?.content_type).toBe("audio")
		expect(info?.content_metadata).toBeUndefined()
	})

	it("reports the audio kind even when no cover resolves", async () => {
		const { handler } = build({ kind: "publish-failed" })

		const info = await handler.getMediaInfo(status(LOCAL_ARTWORK))

		expect(info?.content_type).toBe("audio")
		expect(info?.content_image_url).toBeUndefined()
		expect(info?.content_metadata).toBeUndefined()
	})
})

const CATALOG_POSTER = "https://catalog.example/poster.jpg"

function videoStatus(title: string): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 60, time: 60, duration: 1420, rate: 1 },
		mediaType: "video",
		media: { title },
	}
}

function buildVideo(result: CatalogResult | null): MediaInfoHandler {
	const refuse = async (): Promise<never> => {
		throw new Error("the audio path must not be consulted for video")
	}
	const artwork = new ArtworkResolver({ fetch: refuse }, { resolve: refuse })
	const catalog = { resolve: async () => result } as unknown as CatalogResolver
	const vlc = { readStatus: async () => null } as unknown as VlcClient
	const imageProxy = { getImageAsDataUrl: async () => null } as unknown as ImageProxy

	return new MediaInfoHandler(artwork, catalog, vlc, imageProxy)
}

describe("MediaInfoHandler video content fields", () => {
	it("reports the canonical title, the tv kind, and the episode it is playing", async () => {
		const handler = buildVideo({
			title: "Sora wa Akai Kawa no Hotori",
			poster: CATALOG_POSTER,
			mediaKind: "tv",
			season: 1,
			episode: 11,
		})

		const info = await handler.getMediaInfo(videoStatus("[SubsPlease] Red River - 11.mkv"))

		expect(info?.content_type).toBe("tv_show")
		expect(info?.content_metadata?.clean_title).toBe("Sora wa Akai Kawa no Hotori")
		expect(info?.content_metadata?.season).toBe(1)
		expect(info?.content_metadata?.episode).toBe(11)
		expect(info?.content_image_url).toBe(CATALOG_POSTER)
	})

	it("reports a movie without inventing a season or an episode", async () => {
		const handler = buildVideo({ title: "Akira", poster: CATALOG_POSTER, mediaKind: "movie" })

		const info = await handler.getMediaInfo(videoStatus("Akira.1988.1080p.mkv"))

		expect(info?.content_type).toBe("movie")
		expect(info?.content_metadata?.clean_title).toBe("Akira")
		expect(info?.content_metadata?.season).toBeUndefined()
		expect(info?.content_metadata?.episode).toBeUndefined()
	})

	it("reports the identified work even when it came back without a poster", async () => {
		const handler = buildVideo({ title: "Monster", poster: null, mediaKind: "tv", season: 2 })

		const info = await handler.getMediaInfo(videoStatus("Monster S02E04.mkv"))

		expect(info?.content_image_url).toBeUndefined()
		expect(info?.content_type).toBe("tv_show")
		expect(info?.content_metadata?.clean_title).toBe("Monster")
		expect(info?.content_metadata?.season).toBe(2)
		expect(info?.content_metadata?.episode).toBeUndefined()
	})

	it("leaves the fields absent when the catalog identifies nothing", async () => {
		const handler = buildVideo(null)

		const info = await handler.getMediaInfo(videoStatus("unknown release.mkv"))

		expect(info?.content_type).toBeUndefined()
		expect(info?.content_metadata).toBeUndefined()
		expect(info?.content_image_url).toBeUndefined()
	})
})
