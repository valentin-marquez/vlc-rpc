import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it } from "vitest"
import { type FileCover, type MusicCatalog, Resolver } from "./artwork.resolver"

const CATALOG_COVER = "https://catalog.example/cover.jpg"
const OVERRIDE_COVER = "https://corrected.example/right.jpg"

function status(): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 1,
		playback: { position: 0, time: 0, duration: 210, rate: 1 },
		mediaType: "audio",
		media: { title: "Probablemente", artist: "Christina Aguilera", album: "Mi Reflejo" },
	}
}

function fakeCover(outcome: CoverOutcome) {
	const calls = { fetch: 0 }
	const cover: FileCover = {
		fetch: async () => {
			calls.fetch++
			return outcome
		},
	}
	return { cover, calls }
}

function fakeMusic(result: MusicResult | null, override: string | null = null) {
	const calls = { resolve: 0 }
	const music: MusicCatalog = {
		resolve: async () => {
			calls.resolve++
			return result
		},
		overrideCoverFor: async () => override,
	}
	return { music, calls }
}

const catalogHit: MusicResult = { cover: CATALOG_COVER, provider: "itunes", id: "42" }

describe("Artwork resolver", () => {
	it("uses the published artwork and consults no catalog", async () => {
		const cover = fakeCover({ kind: "published", url: "https://uploads.example/local.jpg" })
		const music = fakeMusic(catalogHit)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBe("https://uploads.example/local.jpg")
		expect(music.calls.resolve).toBe(0)
	})

	it("asks the catalog when the file carries no artwork", async () => {
		const cover = fakeCover({ kind: "no-artwork" })
		const music = fakeMusic(catalogHit)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBe(CATALOG_COVER)
		expect(music.calls.resolve).toBe(1)
	})

	it("does not ask the catalog when the file has artwork that failed to publish", async () => {
		const cover = fakeCover({ kind: "publish-failed" })
		const music = fakeMusic(catalogHit)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBeNull()
		expect(music.calls.resolve).toBe(0)
	})

	it("shows the correction the user typed over the artwork the file carries", async () => {
		const cover = fakeCover({ kind: "published", url: "https://uploads.example/local.jpg" })
		const music = fakeMusic(catalogHit, OVERRIDE_COVER)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBe(OVERRIDE_COVER)
		expect(cover.calls.fetch).toBe(0)
		expect(music.calls.resolve).toBe(0)
	})

	it("shows the correction when the file's own artwork could not be published", async () => {
		const cover = fakeCover({ kind: "publish-failed" })
		const music = fakeMusic(catalogHit, OVERRIDE_COVER)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBe(OVERRIDE_COVER)
	})

	it("shows the correction over a catalog cover when the file carries no artwork", async () => {
		const cover = fakeCover({ kind: "no-artwork" })
		const music = fakeMusic(catalogHit, OVERRIDE_COVER)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBe(OVERRIDE_COVER)
		expect(music.calls.resolve).toBe(0)
	})

	it("reports nothing when the file has no artwork and the catalog has none either", async () => {
		const cover = fakeCover({ kind: "no-artwork" })
		const music = fakeMusic(null)
		const resolver = new Resolver(cover.cover, music.music)

		expect(await resolver.resolve(status())).toBeNull()
		expect(music.calls.resolve).toBe(1)
	})
})
