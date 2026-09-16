import type { TmdbKeyCheck } from "@shared/catalog/catalog.types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { handlers, logged } = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	logged: [] as string[],
}))

vi.mock("@main/core/logger", () => ({
	logger: {
		info: (message: string) => {
			logged.push(message)
		},
		warn: (message: string) => {
			logged.push(message)
		},
		error: (message: string) => {
			logged.push(message)
		},
		debug: (message: string) => {
			logged.push(message)
		},
	},
}))

vi.mock("@main/core/config", () => ({
	configService: { get: () => undefined, set: () => {} },
}))

vi.mock("@main/core/ipc", () => ({
	registerHandler: (channel: string, handler: (...args: unknown[]) => unknown) => {
		handlers.set(channel, handler)
	},
}))

import { TmdbKeyHandler } from "./catalog.handler"

const API_KEY = "0123456789abcdef0123456789abcdef"

function verify(apiKey: string): Promise<TmdbKeyCheck> {
	const handler = handlers.get("catalog:tmdb:verify")
	if (!handler) {
		throw new Error("catalog:tmdb:verify was never registered")
	}
	return handler(apiKey) as Promise<TmdbKeyCheck>
}

function respondWith(status: number): ReturnType<typeof vi.fn> {
	const fetchSpy = vi.fn(async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => ({ results: [] }),
	}))
	vi.stubGlobal("fetch", fetchSpy)
	return fetchSpy
}

beforeEach(() => {
	handlers.clear()
	logged.length = 0
	new TmdbKeyHandler()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("TmdbKeyHandler", () => {
	it("reports a key TMDB accepts as valid, using the key it was given", async () => {
		const fetchSpy = respondWith(200)

		await expect(verify(API_KEY)).resolves.toBe("valid")

		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(`api_key=${API_KEY}`)
	})

	it("reports a key TMDB refuses as rejected", async () => {
		respondWith(401)

		await expect(verify("not-a-real-key")).resolves.toBe("rejected")
	})

	it("reports a suspended account as rejected", async () => {
		respondWith(403)

		await expect(verify(API_KEY)).resolves.toBe("rejected")
	})

	it("reports an empty key as rejected without calling TMDB", async () => {
		const fetchSpy = respondWith(200)

		await expect(verify("   ")).resolves.toBe("rejected")

		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("reports a network failure as unreachable, not as a bad key", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("fetch failed")
			}),
		)

		await expect(verify(API_KEY)).resolves.toBe("unreachable")
	})

	it("reports a TMDB outage as unreachable, not as a bad key", async () => {
		respondWith(503)

		await expect(verify(API_KEY)).resolves.toBe("unreachable")
	})

	it("never writes the key to the log", async () => {
		respondWith(200)
		await verify(API_KEY)

		respondWith(401)
		await verify(API_KEY)

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error(`fetch to https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}`)
			}),
		)
		await verify(API_KEY)

		expect(logged.length).toBeGreaterThan(0)
		expect(logged.some((message) => message.includes(API_KEY))).toBe(false)
	})
})
