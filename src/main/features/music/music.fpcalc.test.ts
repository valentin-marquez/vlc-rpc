import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("electron", () => ({
	app: { isPackaged: false, getAppPath: () => "C:\\dev\\vlc-rpc" },
}))

import { Fpcalc, fpcalcPath, parseFpcalc } from "./music.fpcalc"

function fixture(name: string): string {
	return readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf-8")
}

describe("fpcalcPath", () => {
	it("looks beside the packaged app, where extraResources puts it", () => {
		const path = fpcalcPath({
			packaged: true,
			resourcesPath: join("C", "app", "resources"),
			appPath: join("C", "app", "resources", "app.asar"),
			platform: "win32",
			arch: "x64",
		})

		expect(path).toBe(join("C", "app", "resources", "resources", "bin", "win32-x64", "fpcalc.exe"))
	})

	it("looks inside the repository in development, where the fetch script puts it", () => {
		const path = fpcalcPath({
			packaged: false,
			resourcesPath: join("C", "electron", "resources"),
			appPath: join("C", "dev", "vlc-rpc"),
			platform: "win32",
			arch: "x64",
		})

		expect(path).toBe(join("C", "dev", "vlc-rpc", "resources", "bin", "win32-x64", "fpcalc.exe"))
	})

	it("drops the exe suffix off Windows and keeps the platform pair in the folder", () => {
		const path = fpcalcPath({
			packaged: false,
			resourcesPath: "/opt/app/resources",
			appPath: "/home/user/vlc-rpc",
			platform: "linux",
			arch: "arm64",
		})

		expect(path).toBe(join("/home/user/vlc-rpc", "resources", "bin", "linux-arm64", "fpcalc"))
	})
})

describe("parseFpcalc", () => {
	it("reads the fingerprint and the duration out of a real fpcalc capture", () => {
		const outcome = parseFpcalc(fixture("fpcalc-output"))

		expect(outcome.kind).toBe("fingerprinted")
		if (outcome.kind !== "fingerprinted") return
		expect(outcome.duration).toBe(232.97)
		expect(outcome.fingerprint.startsWith("AQADtMqSJMlKKci4Qz3aww8znDmUb8ebwj1y1E6E")).toBe(true)
	})

	it("fails on output that is not json rather than throwing at the caller", () => {
		expect(parseFpcalc("ERROR: could not decode audio").kind).toBe("failed")
	})

	it("fails on a json object with an empty fingerprint or no duration", () => {
		expect(parseFpcalc('{"duration":232.97,"fingerprint":""}').kind).toBe("failed")
		expect(parseFpcalc('{"fingerprint":"AQAD"}').kind).toBe("failed")
		expect(parseFpcalc('{"duration":0,"fingerprint":"AQAD"}').kind).toBe("failed")
	})
})

describe("Fpcalc", () => {
	it("reports itself unavailable when the binary was never installed", async () => {
		const fpcalc = new Fpcalc(join(__dirname, "__fixtures__", "there-is-no-fpcalc-here"))

		expect(fpcalc.available).toBe(false)
		expect(await fpcalc.fingerprint(join(__dirname, "music.fpcalc.test.ts"))).toEqual({
			kind: "absent",
		})
	})
})
