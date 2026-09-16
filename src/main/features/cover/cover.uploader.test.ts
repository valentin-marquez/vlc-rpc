import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const logs = vi.hoisted(() => ({
	info: [] as string[],
	warn: [] as string[],
	error: [] as string[],
}))

vi.mock("@main/core/logger", () => ({
	logger: {
		info: (message: string) => logs.info.push(message),
		warn: (message: string) => logs.warn.push(message),
		error: (message: string) => logs.error.push(message),
		debug: () => {},
	},
}))

import { Uploader } from "./cover.uploader"

const EVERY_HOST = ["0x0.st", "catbox.moe", "tempfile.org", "tmpfiles.org", "uguu.se", "x0.at"]

/** What each host answers when the upload succeeds, in that host's own shape. */
const OK_BODY: Record<string, unknown> = {
	"x0.at": "https://x0.at/raced.jpg",
	"catbox.moe": "https://files.catbox.moe/raced.jpg",
	"0x0.st": "https://0x0.st/raced.jpg",
	"uguu.se": { success: true, files: [{ url: "https://uguu.se/raced.jpg" }] },
	"tmpfiles.org": { status: "success", data: { url: "http://tmpfiles.org/9911/raced.jpg" } },
	"tempfile.org": { success: true, files: [{ url: "https://tempfile.org/RaCeD1/" }] },
}

/** The url uploadImage should report once that host wins. */
const OK_URL: Record<string, string> = {
	"x0.at": "https://x0.at/raced.jpg",
	"catbox.moe": "https://files.catbox.moe/raced.jpg",
	"0x0.st": "https://0x0.st/raced.jpg",
	"uguu.se": "https://uguu.se/raced.jpg",
	"tmpfiles.org": "https://tmpfiles.org/dl/9911/raced.jpg",
	"tempfile.org": "https://tempfile.org/RaCeD1/download",
}

/** Long enough that a host answering at 0ms always beats it. */
const SLOW_MS = 80

type Reply =
	| { kind: "url"; delayMs: number }
	| { kind: "junk"; delayMs: number }
	| { kind: "status"; status: number; delayMs: number }
	| { kind: "hang" }

interface Entrant {
	host: string
	signal: AbortSignal
	aborts: number
}

function responseFor(host: string, plan: Reply): unknown {
	if (plan.kind === "status") {
		return { ok: false, status: plan.status, text: async () => "", json: async () => ({}) }
	}

	if (plan.kind === "junk") {
		return {
			ok: true,
			status: 200,
			text: async () => "rate limit exceeded",
			json: async () => ({ success: false, status: "error" }),
		}
	}

	const body = OK_BODY[host]
	return {
		ok: true,
		status: 200,
		text: async () => String(body),
		json: async () => body,
	}
}

/**
 * Stub every host at once and hand back the entrants in the order the uploader
 * started them, each carrying the signal it was given.
 */
function stubRace(plan: (host: string, index: number) => Reply): Entrant[] {
	const entrants: Entrant[] = []

	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, init: { signal: AbortSignal }) => {
			const entrant: Entrant = {
				host: new URL(url).hostname,
				signal: init.signal,
				aborts: 0,
			}
			entrant.signal.addEventListener("abort", () => {
				entrant.aborts++
			})
			entrants.push(entrant)

			const reply = plan(entrant.host, entrants.length - 1)

			return new Promise((resolve, reject) => {
				const timer =
					reply.kind === "hang"
						? null
						: setTimeout(() => resolve(responseFor(entrant.host, reply)), reply.delayMs)

				entrant.signal.addEventListener("abort", () => {
					if (timer) {
						clearTimeout(timer)
					}
					reject(new DOMException("The operation was aborted.", "AbortError"))
				})
			})
		}),
	)

	return entrants
}

function artwork(): Buffer {
	return Buffer.from([0xff, 0xd8, 0xff, 0xdb])
}

/** Let the losing attempts reject and log before the assertions read the log. */
function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 20))
}

beforeEach(() => {
	logs.info.length = 0
	logs.warn.length = 0
	logs.error.length = 0
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("Uploader race", () => {
	it("fires the upload at every service at once instead of one after another", async () => {
		const entrants = stubRace((host) =>
			host === "x0.at" ? { kind: "url", delayMs: 0 } : { kind: "hang" },
		)

		await new Uploader().uploadImage(artwork(), "cover.jpg")

		// The five hosts that never answer would have stalled a sequential walk
		expect(entrants.map((entrant) => entrant.host).sort()).toEqual(EVERY_HOST)
	})

	it("returns the url of the service that answers first, not of the slow one", async () => {
		stubRace((host) =>
			host === "uguu.se" ? { kind: "url", delayMs: 0 } : { kind: "url", delayMs: SLOW_MS },
		)

		const url = await new Uploader().uploadImage(artwork(), "cover.jpg")

		expect(url).toBe(OK_URL["uguu.se"])
	})

	it("aborts the services still in flight as soon as one of them wins", async () => {
		const entrants = stubRace((host) =>
			host === "x0.at" ? { kind: "url", delayMs: 0 } : { kind: "hang" },
		)

		await new Uploader().uploadImage(artwork(), "cover.jpg")

		const winner = entrants.find((entrant) => entrant.host === "x0.at")
		const losers = entrants.filter((entrant) => entrant.host !== "x0.at")

		expect(winner?.signal.aborted).toBe(false)
		expect(losers).toHaveLength(5)
		expect(losers.every((loser) => loser.signal.aborted)).toBe(true)
	})

	it("aborts every loser exactly once, even when the winner is the last one started", async () => {
		const entrants = stubRace((_host, index) =>
			index === EVERY_HOST.length - 1 ? { kind: "url", delayMs: 0 } : { kind: "hang" },
		)

		const url = await new Uploader().uploadImage(artwork(), "cover.jpg")

		expect(url).not.toBeNull()
		expect(entrants).toHaveLength(EVERY_HOST.length)
		expect(entrants.at(-1)?.aborts).toBe(0)
		expect(entrants.slice(0, -1).map((entrant) => entrant.aborts)).toEqual([1, 1, 1, 1, 1])
	})

	it("does not let a non-ok status win, and leaves the other services running", async () => {
		stubRace((host) => {
			if (host === "catbox.moe") {
				return { kind: "status", status: 500, delayMs: 0 }
			}
			if (host === "uguu.se") {
				return { kind: "url", delayMs: SLOW_MS }
			}
			return { kind: "hang" }
		})

		const url = await new Uploader().uploadImage(artwork(), "cover.jpg")

		// uguu.se could only answer because catbox.moe failing left it alone
		expect(url).toBe(OK_URL["uguu.se"])
	})

	it("does not let an ok response that is not a url win, and leaves the others running", async () => {
		stubRace((host) => {
			if (host === "x0.at") {
				return { kind: "junk", delayMs: 0 }
			}
			if (host === "tempfile.org") {
				return { kind: "url", delayMs: SLOW_MS }
			}
			return { kind: "hang" }
		})

		const url = await new Uploader().uploadImage(artwork(), "cover.jpg")

		expect(url).toBe(OK_URL["tempfile.org"])
	})

	it("returns null when every service fails, so a failed publish stays distinguishable", async () => {
		stubRace(() => ({ kind: "status", status: 503, delayMs: 0 }))

		const url = await new Uploader().uploadImage(artwork(), "cover.jpg")

		expect(url).toBeNull()
	})

	it("does not log an abort as an error or a failure", async () => {
		stubRace((host) => (host === "x0.at" ? { kind: "url", delayMs: 0 } : { kind: "hang" }))

		await new Uploader().uploadImage(artwork(), "cover.jpg")
		await settle()

		expect(logs.error).toEqual([])
		expect(logs.warn).toEqual([])
	})
})
