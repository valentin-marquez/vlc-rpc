import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const APP_CONFIG = { httpPort: 4321, httpPassword: "from-app-config", httpEnabled: false }

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) => (key === "vlc" ? { ...APP_CONFIG } : {}),
		set: () => {},
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

	// KNOWN BUG, pinned deliberately.
	//
	// This fixture is a stock vlcrc with every http setting commented out, which
	// is what a fresh VLC install writes and what HTTP disabled actually looks
	// like. Every regex in the parser carries an optional `#` prefix, and there
	// is a fallback that assumes enabled whenever a port or password turns up,
	// so a commented out setting reads as an active one.
	//
	// When this is fixed, httpEnabled becomes false here and the app can finally
	// tell the user that VLC is not set up.
	it("reports http as enabled even though every setting is commented out", async () => {
		const config = await handlerFor("vlcrc-defaults").getVlcConfig()

		expect(config.httpEnabled).toBe(true)
	})

	// KNOWN BUG, pinned deliberately.
	//
	// With no vlcrc at all, getVlcConfig falls back to returning the app's own
	// stored config. synchronizeConfig then compares that against the app's
	// stored config and unsurprisingly finds them identical, so it logs
	// "VLC configuration is already in sync" about a file that does not exist.
	// The read gives the caller no way to tell a real answer from a fallback.
	it("returns the app's own config when vlcrc is missing, indistinguishable from a real read", async () => {
		const config = await handlerFor(null).getVlcConfig()

		expect(config).toEqual(APP_CONFIG)
	})
})
