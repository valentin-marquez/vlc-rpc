import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const APP_CONFIG = { httpPort: 4321, httpPassword: "from-app-config", httpEnabled: false }
const configSetCalls: Array<[string, unknown]> = []

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => (key === "vlc" ? { ...APP_CONFIG } : {}),
		set: (key: string, value: unknown) => {
			configSetCalls.push([key, value])
		},
		delete: () => {},
	},
}))

vi.mock("./vlc.client", () => ({
	vlcStatusService: { updateConnectionInfo: () => {} },
}))

import { VlcConfigHandler } from "./vlc-config.handler"

let root: string

/** Points the handler at a throwaway vlcrc by faking where VLC keeps its config. */
function handlerFor(fixture: string | null): VlcConfigHandler {
	const vlcDir = join(root, "vlc")
	mkdirSync(vlcDir, { recursive: true })
	if (fixture) {
		copyFileSync(join(__dirname, "__fixtures__", `${fixture}.txt`), join(vlcDir, "vlcrc"))
	}
	process.env.APPDATA = root
	return new VlcConfigHandler()
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "vlcrc-"))
	configSetCalls.length = 0
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
	vi.restoreAllMocks()
})

describe.runIf(process.platform === "win32")("getVlcConfig", () => {
	it("reads port and password from a configured vlcrc", async () => {
		const config = await handlerFor("vlcrc-configured").getVlcConfig()

		expect(config.httpPort).toBe(9080)
		expect(config.httpPassword).toBe("TestPassword123")
		expect(config.httpEnabled).toBe(true)
	})

	it("reports http as disabled when every setting is commented out", async () => {
		// This fixture is what a fresh VLC install writes: every http setting
		// present but commented. See parseVlcConfig for the parsing fix.
		const config = await handlerFor("vlcrc-defaults").getVlcConfig()

		expect(config.httpEnabled).toBe(false)
	})

	it("falls back to the app's own stored config when vlcrc is missing", async () => {
		// This fallback is intentional and documented on getVlcConfig: callers
		// that need to tell it apart from a real read use readVlcConfigFile via
		// synchronizeConfig instead, tested below.
		const config = await handlerFor(null).getVlcConfig()

		expect(config).toEqual(APP_CONFIG)
	})
})

describe.runIf(process.platform === "win32")("synchronizeConfig", () => {
	// The constructor fires synchronizeConfig() itself, without awaiting it.
	// Awaiting its exposed .ready before resetting configSetCalls keeps that
	// initial run's side effect from leaking into the explicit call below.
	async function settledHandlerFor(fixture: string | null): Promise<VlcConfigHandler> {
		const handler = handlerFor(fixture)
		await handler.ready
		configSetCalls.length = 0
		return handler
	}

	it("does not touch the app's config when vlcrc is missing", async () => {
		const handler = await settledHandlerFor(null)
		await handler.synchronizeConfig()

		expect(configSetCalls).toHaveLength(0)
	})

	it("updates the app's config to match a vlcrc that disagrees with it", async () => {
		// APP_CONFIG says httpEnabled: false; this vlcrc says true. Before the
		// fix, comparing getVlcConfig()'s fallback against itself meant a
		// missing file always looked "in sync", and a present but misparsed
		// file could go undetected the same way.
		const handler = await settledHandlerFor("vlcrc-configured")
		await handler.synchronizeConfig()

		expect(configSetCalls).toEqual([
			["vlc", { httpPort: 9080, httpPassword: "TestPassword123", httpEnabled: true }],
		])
	})

	it("leaves the app's config alone when vlcrc already agrees with it", async () => {
		// Written to match APP_CONFIG exactly: same port, no active interface
		// setting so httpEnabled parses false, and no password so it falls back
		// to APP_CONFIG's own, same as APP_CONFIG's stored password.
		mkdirSync(join(root, "vlc"), { recursive: true })
		writeFileSync(join(root, "vlc", "vlcrc"), "[core]\nhttp-port=4321\n")
		process.env.APPDATA = root
		const handler = new VlcConfigHandler()
		await handler.ready
		configSetCalls.length = 0

		await handler.synchronizeConfig()

		expect(configSetCalls).toHaveLength(0)
	})
})
