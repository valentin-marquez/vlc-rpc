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
import type { OverrideTarget } from "@main/features/overrides"
import { MediaInfoHandler, type OverrideTargets } from "./media.handler"
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

function build(
	outcome: CoverOutcome,
	result: MusicResult | null = catalogHit,
	target: OverrideTarget | null = null,
) {
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
			overrideCoverFor: () => null,
		},
	)
	const refuse = (): never => {
		throw new Error("the video catalog must not be consulted for audio")
	}
	const catalog = { resolve: refuse, overrideTargetFor: refuse } as unknown as CatalogResolver
	const music: OverrideTargets = { overrideTargetFor: () => target }
	const vlc = { readStatus: async () => null } as unknown as VlcClient
	// Null keeps every URL as it was resolved, so the assertions read the
	// decision under test rather than a data URL.
	const imageProxy = { getImageAsDataUrl: async () => null } as unknown as ImageProxy

	return { handler: new MediaInfoHandler(artwork, catalog, music, vlc, imageProxy), calls }
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

function buildVideo(
	result: CatalogResult | null,
	target: OverrideTarget | null = null,
): MediaInfoHandler {
	const refuse = (): never => {
		throw new Error("the audio path must not be consulted for video")
	}
	const artwork = new ArtworkResolver(
		{ fetch: refuse },
		{ resolve: refuse, overrideCoverFor: refuse },
	)
	const catalog = {
		resolve: async () => result,
		overrideTargetFor: () => target,
	} as unknown as CatalogResolver
	const music: OverrideTargets = {
		overrideTargetFor: () => {
			throw new Error("the audio path must not be consulted for video")
		},
	}
	const vlc = { readStatus: async () => null } as unknown as VlcClient
	const imageProxy = { getImageAsDataUrl: async () => null } as unknown as ImageProxy

	return new MediaInfoHandler(artwork, catalog, music, vlc, imageProxy)
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

describe("MediaInfoHandler override key", () => {
	it("reports the key of a video the catalog identified as nothing", async () => {
		// Western film and television have no provider, so this is the permanent
		// state of that half of the library and the case the correction exists for.
		const handler = buildVideo(null, { key: "movie:Some Movie|2019", active: false })

		const info = await handler.getMediaInfo(videoStatus("Some.Movie.2019.1080p.BluRay.mkv"))

		expect(info?.content_type).toBeUndefined()
		expect(info?.override_key).toBe("movie:Some Movie|2019")
		expect(info?.override_active).toBe(false)
	})

	it("reports the key alongside a work the catalog did identify", async () => {
		const handler = buildVideo(
			{ title: "Monster", poster: CATALOG_POSTER, mediaKind: "tv", season: 2 },
			{ key: "tv:Monster|2", active: false },
		)

		const info = await handler.getMediaInfo(videoStatus("Monster S02E04.mkv"))

		expect(info?.content_metadata?.clean_title).toBe("Monster")
		expect(info?.override_key).toBe("tv:Monster|2")
		expect(info?.override_active).toBe(false)
	})

	it("says when the key already carries an override, so the form can offer to drop it", async () => {
		const handler = buildVideo(
			{ title: "The Show It Really Is", poster: CATALOG_POSTER, mediaKind: "tv", season: 1 },
			{ key: "tv:Some Show|1", active: true },
		)

		const info = await handler.getMediaInfo(videoStatus("Some.Show.S01E07.mkv"))

		expect(info?.override_key).toBe("tv:Some Show|1")
		expect(info?.override_active).toBe(true)
	})

	it("reports no key at all when the store would refuse the one this file produces", async () => {
		const handler = buildVideo(null, null)

		const info = await handler.getMediaInfo(videoStatus("[Erai-raws] 1080p"))

		expect(info?.override_key).toBeUndefined()
		expect(info?.override_active).toBeUndefined()
	})

	it("reports the audio key of the record, not of the track", async () => {
		const { handler } = build({ kind: "no-artwork" }, catalogHit, {
			key: "audio:christina aguilera|mi reflejo",
			active: false,
		})

		const info = await handler.getMediaInfo(status())

		expect(info?.content_type).toBe("audio")
		expect(info?.override_key).toBe("audio:christina aguilera|mi reflejo")
		expect(info?.override_active).toBe(false)
	})

	it("reports the audio key even when the file's own artwork won", async () => {
		const { handler, calls } = build({ kind: "published", url: PUBLISHED_COVER }, catalogHit, {
			key: "audio:christina aguilera|mi reflejo",
			active: true,
		})

		const info = await handler.getMediaInfo(status(LOCAL_ARTWORK))

		expect(calls.resolve).toBe(0)
		expect(info?.override_key).toBe("audio:christina aguilera|mi reflejo")
		expect(info?.override_active).toBe(true)
	})
})
