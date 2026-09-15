import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseVlcConfig } from "./vlc-config.mapper"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", name), "utf-8")
}

describe("parseVlcConfig", () => {
	it("reads an active configuration", () => {
		expect(parseVlcConfig(fixture("vlcrc-configured.txt"))).toEqual({
			httpPort: 9080,
			httpPassword: "TestPassword123",
			httpEnabled: true,
		})
	})

	it("reports disabled when every http setting is commented out", () => {
		// This is what a fresh VLC install writes. It used to report enabled:
		// see the regression test below for why.
		expect(parseVlcConfig(fixture("vlcrc-defaults.txt"))).toEqual({
			httpPort: 8080,
			httpPassword: null,
			httpEnabled: false,
		})
	})

	it("does not treat a commented setting as active", () => {
		const content = "[core]\n#extraintf=http\n#http-port=9080\n[lua]\n#http-password=secret\n"
		expect(parseVlcConfig(content)).toEqual({
			httpPort: 8080,
			httpPassword: null,
			httpEnabled: false,
		})
	})

	it("does not require an active setting to enable http from port or password alone", () => {
		// The old parser assumed enabled whenever it found a non default port or
		// any password, active or not. Only extraintf=http or intf=http means
		// the interface is actually on.
		const content = "[core]\nhttp-port=9080\n[lua]\nhttp-password=secret\n"
		expect(parseVlcConfig(content).httpEnabled).toBe(false)
	})

	it("regression: an empty commented value does not leak the next section's line", () => {
		// The regex based parser used \s*=\s* to find the value, and \s* matches
		// newlines. "#http-password=" has nothing after the "=", so \s* kept
		// consuming through the blank line and grabbed "[qt] # Qt interface",
		// the next non-blank line, as the "password". A non-null, non-empty
		// password then tripped the "assume enabled" fallback.
		const content = "[lua]\n#http-password=\n\n[qt] # Qt interface\n#qt-notification=1\n"
		expect(parseVlcConfig(content)).toEqual({
			httpPort: 8080,
			httpPassword: null,
			httpEnabled: false,
		})
	})

	it("enables via intf=http even with no extraintf setting", () => {
		expect(parseVlcConfig("[core]\nintf=http\n").httpEnabled).toBe(true)
	})

	it("enables via extraintf listing http among other interfaces", () => {
		expect(parseVlcConfig("[core]\nextraintf=growl,http\n").httpEnabled).toBe(true)
	})

	it("falls back to the legacy [http] section for port and password", () => {
		const config = parseVlcConfig("[http]\nport=9090\npassword=legacy\n")
		expect(config.httpPort).toBe(9090)
		expect(config.httpPassword).toBe("legacy")
	})

	it("ignores an empty file", () => {
		expect(parseVlcConfig("")).toEqual({ httpPort: 8080, httpPassword: null, httpEnabled: false })
	})
})
