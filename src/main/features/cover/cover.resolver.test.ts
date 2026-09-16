import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Client as VlcClient } from "@main/features/vlc"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

function fakeUploader(uploadImage: Uploader["uploadImage"] = async () => null): Uploader {
	return {
		parseMetadataTags: () => ({
			imageUrl: null,
			isExpired: false,
			appVersion: null,
			processedBy: null,
		}),
		generateMetadataTags: () => ({}),
		uploadImage,
	} as unknown as Uploader
}

/** A playing file whose URI VLC can report, which publishing an upload requires. */
function fakeVlc(): VlcClient {
	return {
		getCurrentFileUri: async () => "file:///music/song.mp3",
	} as unknown as VlcClient
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

		expect(await resolver.fetch(null)).toEqual({ kind: "no-artwork" })
		expect(calls).toBe(0)

		await resolver.fetch(status({ artist: "Christian Nodal", album: "Ahora" }))
		expect(calls).toBe(1)
	})
})

describe("Resolver outcomes", () => {
	let root: string
	let artworkUrl: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "cover-"))
		const artworkPath = join(root, "cover.jpg")
		writeFileSync(artworkPath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]))
		artworkUrl = pathToFileURL(artworkPath).href
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	it("publishes the artwork embedded in the file and reports its url", async () => {
		const uploader = fakeUploader(async () => "https://0x0.st/cover.jpg")
		const resolver = new Resolver(fakeVlc(), fakeStore(), uploader)

		const outcome = await resolver.fetch(
			status({ artist: "Christian Nodal", album: "Ahora", artworkUrl }),
		)

		expect(outcome).toEqual({ kind: "published", url: "https://0x0.st/cover.jpg" })
	})

	it("reports no artwork when the file has none embedded", async () => {
		const resolver = new Resolver(fakeVlc(), fakeStore(), fakeUploader())

		const outcome = await resolver.fetch(status({ artist: "Christian Nodal", album: "Ahora" }))

		expect(outcome).toEqual({ kind: "no-artwork" })
	})

	it("reports a failed publish, not a file without artwork, when the upload fails", async () => {
		const resolver = new Resolver(
			fakeVlc(),
			fakeStore(),
			fakeUploader(async () => null),
		)

		const outcome = await resolver.fetch(
			status({ artist: "Christian Nodal", album: "Ahora", artworkUrl }),
		)

		expect(outcome).toEqual({ kind: "publish-failed" })
	})

	it("reports a failed publish when the artwork file cannot be read", async () => {
		const resolver = new Resolver(
			fakeVlc(),
			fakeStore(),
			fakeUploader(async () => "https://0x0.st/cover.jpg"),
		)

		const outcome = await resolver.fetch(
			status({
				artist: "Christian Nodal",
				album: "Ahora",
				artworkUrl: pathToFileURL(join(root, "missing.jpg")).href,
			}),
		)

		expect(outcome).toEqual({ kind: "publish-failed" })
	})

	it("does not cache a failed publish, so the next call retries the upload", async () => {
		let uploads = 0
		const uploader = fakeUploader(async () => {
			uploads++
			return uploads === 1 ? null : "https://0x0.st/cover.jpg"
		})
		const resolver = new Resolver(fakeVlc(), fakeStore(), uploader)
		const media = { artist: "Christian Nodal", album: "Ahora", artworkUrl }

		const first = await resolver.fetch(status(media))
		const second = await resolver.fetch(status(media))

		expect(first).toEqual({ kind: "publish-failed" })
		expect(second).toEqual({ kind: "published", url: "https://0x0.st/cover.jpg" })
		expect(uploads).toBe(2)
	})
})
