import type { IpcChannel, IpcRequest, IpcResponse } from "@shared/ipc"
import type { OverrideDraft } from "@shared/ipc/channels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Override, OverrideEntry, OverrideInput } from "./overrides.types"

// The channels are the whole surface under test, so the doubled registrar keeps
// what was registered instead of dropping it on the floor.
const ipc = vi.hoisted(() => ({
	handlers: new Map<string, (...args: never[]) => unknown>(),
}))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({
	registerHandler: (channel: string, handler: (...args: never[]) => unknown) => {
		ipc.handlers.set(channel, handler)
	},
}))

import { Handler, type OverridesStore } from "./overrides.handler"

async function invoke<C extends IpcChannel>(
	channel: C,
	...args: IpcRequest<C>
): Promise<IpcResponse<C>> {
	const handler = ipc.handlers.get(channel)
	if (!handler) {
		throw new Error(`No handler registered for ${channel}`)
	}
	return (await handler(...(args as never[]))) as IpcResponse<C>
}

class FakeStore implements OverridesStore {
	public readonly entries = new Map<string, Override>()
	public writes = 0

	/** The real store throws for a key with no title in it. This reproduces that. */
	public refuseKey: string | null = null

	list(): OverrideEntry[] {
		return [...this.entries].map(([key, override]) => ({ key, override }))
	}

	save(key: string, input: OverrideInput): void {
		if (key === this.refuseKey) {
			throw new Error(`Refusing to save an override under "${key}".`)
		}
		this.entries.set(key, { ...input, savedAt: 0 })
		this.writes++
	}

	delete(key: string): void {
		this.entries.delete(key)
	}
}

const COVER_URL = "https://example.com/poster.jpg"

function videoDraft(cover: string | undefined = COVER_URL): OverrideDraft {
	return {
		kind: "video",
		title: "Sora wa Akai Kawa no Hotori",
		cover,
		mediaKind: "tv",
		sourceFilename: "[Group] Red River - 01 [1080p].mkv",
	}
}

function stubFetch(response: unknown) {
	const mock = vi.fn(async () => response)
	vi.stubGlobal("fetch", mock)
	return mock
}

function answer(overrides: {
	ok?: boolean
	status?: number
	contentType?: string | null
	byteLength?: number
}) {
	return {
		ok: overrides.ok ?? true,
		status: overrides.status ?? 200,
		headers: { get: () => overrides.contentType ?? null },
		arrayBuffer: async () => new ArrayBuffer(overrides.byteLength ?? 8),
	}
}

let store: FakeStore

beforeEach(() => {
	ipc.handlers.clear()
	store = new FakeStore()
	new Handler(store)
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("overrides:list", () => {
	it("returns every override the store holds, with the key it is bound to", async () => {
		store.save("movie:Heat|1995", {
			kind: "video",
			title: "Heat",
			sourceFilename: "Heat.1995.mkv",
		})
		store.save("album:daft punk|discovery", {
			kind: "audio",
			cover: COVER_URL,
			sourceFilename: "01 - One More Time.flac",
		})

		const listed = await invoke("overrides:list")

		expect(listed.map((entry) => entry.key).sort()).toEqual([
			"album:daft punk|discovery",
			"movie:Heat|1995",
		])
		const heat = listed.find((entry) => entry.key === "movie:Heat|1995")?.override
		expect(heat?.kind === "video" ? heat.title : undefined).toBe("Heat")
	})

	it("returns an empty list when the user has corrected nothing", async () => {
		expect(await invoke("overrides:list")).toEqual([])
	})
})

describe("overrides:save", () => {
	it("persists a video override whose cover URL answers with an image", async () => {
		stubFetch(answer({ contentType: "image/jpeg" }))

		const result = await invoke("overrides:save", "tv:Red River|1", videoDraft())

		expect(result).toEqual({ saved: true })
		const saved = store.entries.get("tv:Red River|1")
		expect(saved?.kind === "video" ? saved.title : undefined).toBe("Sora wa Akai Kawa no Hotori")
		expect(saved?.cover).toBe(COVER_URL)
	})

	it("persists an audio override, whose cover is the only field it carries", async () => {
		stubFetch(answer({ contentType: "image/png" }))

		const result = await invoke("overrides:save", "album:daft punk|discovery", {
			kind: "audio",
			cover: COVER_URL,
			sourceFilename: "01 - One More Time.flac",
		})

		expect(result).toEqual({ saved: true })
		expect(store.entries.get("album:daft punk|discovery")?.cover).toBe(COVER_URL)
	})

	it("persists a video override with no cover without reaching the network", async () => {
		const fetchMock = stubFetch(answer({ contentType: "image/jpeg" }))

		const result = await invoke("overrides:save", "movie:Heat|1995", {
			kind: "video",
			title: "Heat",
			sourceFilename: "Heat.1995.mkv",
		})

		expect(result).toEqual({ saved: true })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("reports a cover that is not a usable URL, and writes nothing", async () => {
		const fetchMock = stubFetch(answer({ contentType: "image/jpeg" }))

		const result = await invoke("overrides:save", "tv:Red River|1", videoDraft("poster.jpg"))

		expect(result).toEqual({ saved: false, reason: "cover-not-a-url" })
		expect(fetchMock).not.toHaveBeenCalled()
		expect(store.writes).toBe(0)
	})

	it("reports a cover on a scheme that is not http or https, and writes nothing", async () => {
		const fetchMock = stubFetch(answer({ contentType: "image/jpeg" }))

		const result = await invoke(
			"overrides:save",
			"tv:Red River|1",
			videoDraft("file:///C:/covers/poster.jpg"),
		)

		expect(result).toEqual({ saved: false, reason: "cover-not-a-url" })
		expect(fetchMock).not.toHaveBeenCalled()
		expect(store.writes).toBe(0)
	})

	it("reports a cover whose host never answers, and writes nothing", async () => {
		const failure = new Error("getaddrinfo ENOTFOUND")
		failure.name = "TypeError"
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw failure
			}),
		)

		const result = await invoke("overrides:save", "tv:Red River|1", videoDraft())

		expect(result).toEqual({ saved: false, reason: "cover-unreachable", status: null })
		expect(store.writes).toBe(0)
	})

	it("treats a dead link that answers 404 as unreachable, carrying the status back", async () => {
		stubFetch(answer({ ok: false, status: 404, contentType: "text/html" }))

		const result = await invoke("overrides:save", "tv:Red River|1", videoDraft())

		expect(result).toEqual({ saved: false, reason: "cover-unreachable", status: 404 })
		expect(store.writes).toBe(0)
	})

	it("reports a URL that answers with a page rather than an image, and writes nothing", async () => {
		stubFetch(answer({ contentType: "text/html; charset=utf-8" }))

		const result = await invoke(
			"overrides:save",
			"tv:Red River|1",
			videoDraft("https://example.com/gallery"),
		)

		expect(result).toEqual({
			saved: false,
			reason: "cover-not-an-image",
			contentType: "text/html; charset=utf-8",
		})
		expect(store.writes).toBe(0)
	})

	it("reports an empty body as not an image, whatever the content type claims", async () => {
		stubFetch(answer({ contentType: "image/jpeg", byteLength: 0 }))

		const result = await invoke("overrides:save", "tv:Red River|1", videoDraft())

		expect(result).toEqual({
			saved: false,
			reason: "cover-not-an-image",
			contentType: "image/jpeg",
		})
		expect(store.writes).toBe(0)
	})

	it("gives up on a cover whose body never arrives, rather than waiting on it forever", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: { signal: AbortSignal }) => ({
				ok: true,
				status: 200,
				headers: { get: () => "image/jpeg" },
				arrayBuffer: () =>
					new Promise<ArrayBuffer>((_resolve, reject) => {
						init.signal.addEventListener("abort", () => {
							const aborted = new Error("The operation was aborted")
							aborted.name = "AbortError"
							reject(aborted)
						})
					}),
			})),
		)

		const pending = invoke("overrides:save", "tv:Red River|1", videoDraft())
		await vi.advanceTimersByTimeAsync(5000)

		expect(await pending).toEqual({ saved: false, reason: "cover-unreachable", status: null })
		expect(store.writes).toBe(0)
	})

	it("reports the store's refusal of a key with no identity as a failure, not a crash", async () => {
		stubFetch(answer({ contentType: "image/jpeg" }))
		store.refuseKey = "video:"

		const result = await invoke("overrides:save", "video:", videoDraft())

		expect(result).toEqual({ saved: false, reason: "store-refused" })
		expect(store.entries.has("video:")).toBe(false)
	})
})

describe("overrides:delete", () => {
	it("removes the override under the key", async () => {
		store.save("movie:Heat|1995", {
			kind: "video",
			title: "Heat",
			sourceFilename: "Heat.1995.mkv",
		})

		const result = await invoke("overrides:delete", "movie:Heat|1995")

		expect(result).toBe(true)
		expect(store.entries.has("movie:Heat|1995")).toBe(false)
		expect(await invoke("overrides:list")).toEqual([])
	})

	it("reports success for a key nobody ever corrected", async () => {
		expect(await invoke("overrides:delete", "tv:Nothing Here|1")).toBe(true)
	})
})
