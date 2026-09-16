import type { Resolver as CatalogResolver } from "@main/features/catalog"
import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

vi.mock("@main/core/config", () => ({
	configService: {
		get: () => ({ largeImage: "vlc_logo", playingImage: "playing", pausedImage: "paused" }),
		set: () => {},
		delete: () => {},
	},
}))

// The catalog barrel, reached from presence.state for the video branch, opens
// its own Conf store on import.
vi.mock("electron-conf/main", () => ({
	Conf: class {
		get(): Record<string, never> {
			return {}
		}
		set(): void {}
	},
}))

import { Resolver as ArtworkResolver } from "@main/features/artwork"
import { Service } from "./presence.state"

const LOCAL_ARTWORK = "file:///C:/music/track.jpg"
const PUBLISHED_COVER = "https://uploads.example/local.jpg"
const CATALOG_COVER = "https://catalog.example/cover.jpg"

function status(state: "playing" | "paused", artworkUrl?: string): VlcStatus {
	return {
		active: true,
		status: state,
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

const catalogHit: MusicResult = { cover: CATALOG_COVER, provider: "itunes", id: "42" }
const timeline = { start: 1000, end: 1180 }

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

	return { service: new Service(artwork, catalog), calls }
}

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence audio artwork while $state",
	({ state }) => {
		it("shows the published artwork and consults no catalog", async () => {
			const { service, calls } = build({ kind: "published", url: PUBLISHED_COVER })

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(presence?.large_image).toBe(PUBLISHED_COVER)
			expect(calls.resolve).toBe(0)
		})

		it("shows a catalog cover when the file carries no artwork", async () => {
			const { service, calls } = build({ kind: "no-artwork" })

			const presence = await service.getDiscordPresence(status(state), timeline)

			expect(presence?.large_image).toBe(CATALOG_COVER)
			expect(calls.resolve).toBe(1)
		})

		it("consults no catalog when the file has artwork that failed to publish", async () => {
			const { service, calls } = build({ kind: "publish-failed" })

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(calls.resolve).toBe(0)
			expect(presence?.large_image).not.toBe(CATALOG_COVER)
		})
	},
)
