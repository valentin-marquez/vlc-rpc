import type { Client as VlcClient } from "@main/features/vlc"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { describe, expect, it, vi } from "vitest"
import type { Store } from "./cover.store"
import type { Uploader } from "./cover.uploader"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { Resolver } from "./cover.resolver"

function status(media: VlcStatus["media"]): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 3,
		playback: { position: 0, time: 0, duration: 200, rate: 1 },
		mediaType: "audio",
		media,
	}
}

function fakeStore(): Store {
	return {
		vlcUriToFilePath: () => null,
		readMetadataTags: async () => null,
		writeMetadataTags: async () => true,
	} as unknown as Store
}

function fakeUploader(): Uploader {
	return {
		parseMetadataTags: () => ({
			imageUrl: null,
			isExpired: false,
			appVersion: null,
			processedBy: null,
		}),
		generateMetadataTags: () => ({}),
		uploadImage: async () => null,
	} as unknown as Uploader
}

describe("Resolver caching", () => {
	it("resolves once and reuses the result across calls with the same coverKey", async () => {
		let calls = 0
		const vlc = {
			getCurrentFileUri: async () => {
				calls++
				return null
			},
		} as unknown as VlcClient
		const resolver = new Resolver(vlc, fakeStore(), fakeUploader())

		await resolver.fetch(
			status({ artist: "Christian Nodal", album: "Ahora", title: "Probablemente" }),
		)
		await resolver.fetch(
			status({ artist: "Christian Nodal", album: "Ahora", title: "Otra Cancion" }),
		)

		expect(calls).toBe(1)
	})

	it("re-resolves when the album changes, a different coverKey", async () => {
		let calls = 0
		const vlc = {
			getCurrentFileUri: async () => {
				calls++
				return null
			},
		} as unknown as VlcClient
		const resolver = new Resolver(vlc, fakeStore(), fakeUploader())

		await resolver.fetch(status({ artist: "Christian Nodal", album: "Ahora" }))
		await resolver.fetch(status({ artist: "Christian Nodal", album: "Forajido" }))

		expect(calls).toBe(2)
	})

	it("does not touch the cache when there is no media info", async () => {
		let calls = 0
		const vlc = {
			getCurrentFileUri: async () => {
				calls++
				return null
			},
		} as unknown as VlcClient
		const resolver = new Resolver(vlc, fakeStore(), fakeUploader())

		expect(await resolver.fetch(null)).toBeNull()
		expect(calls).toBe(0)

		await resolver.fetch(status({ artist: "Christian Nodal", album: "Ahora" }))
		expect(calls).toBe(1)
	})
})
