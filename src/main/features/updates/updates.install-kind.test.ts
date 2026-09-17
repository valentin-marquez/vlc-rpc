import { describe, expect, it } from "vitest"
import { detectInstallKind, probeInstall, uninstallerPath } from "./updates.install-kind"

describe("detectInstallKind", () => {
	it("calls a copy launched by the portable stub portable", () => {
		expect(detectInstallKind({ portableLauncher: true, uninstallerPresent: false })).toEqual({
			kind: "portable",
			reason: "portable-launcher",
		})
	})

	it("calls a copy with an uninstaller beside it installed", () => {
		expect(detectInstallKind({ portableLauncher: false, uninstallerPresent: true })).toEqual({
			kind: "installed",
		})
	})

	it("falls back to portable when nothing identifies the copy", () => {
		expect(detectInstallKind({ portableLauncher: false, uninstallerPresent: false })).toEqual({
			kind: "portable",
			reason: "no-uninstaller",
		})
	})

	it("trusts the stub over a stray uninstaller", () => {
		expect(detectInstallKind({ portableLauncher: true, uninstallerPresent: true })).toEqual({
			kind: "portable",
			reason: "portable-launcher",
		})
	})
})

describe("uninstallerPath", () => {
	it("points one level above the resources directory", () => {
		expect(uninstallerPath("D:/Apps/VLC Discord RP/resources")).toMatch(
			/Uninstall VLC Discord RP\.exe$/,
		)
		expect(uninstallerPath("D:/Apps/VLC Discord RP/resources")).not.toContain("resources")
	})
})

describe("probeInstall", () => {
	const resources = "D:/Apps/VLC Discord RP/resources"

	it("reads the portable launcher from the environment the stub sets", () => {
		expect(
			probeInstall(
				{ PORTABLE_EXECUTABLE_FILE: "D:/apps/VLC Discord RP.exe" },
				resources,
				() => false,
			).portableLauncher,
		).toBe(true)
		expect(probeInstall({}, resources, () => false).portableLauncher).toBe(false)
		expect(
			probeInstall({ PORTABLE_EXECUTABLE_FILE: "" }, resources, () => false).portableLauncher,
		).toBe(false)
	})

	it("asks for the uninstaller exactly once, at the install root", () => {
		const seen: string[] = []

		const probe = probeInstall({}, resources, (path) => {
			seen.push(path)
			return true
		})

		expect(seen).toEqual([uninstallerPath(resources)])
		expect(probe.uninstallerPresent).toBe(true)
	})

	it("reads an install placed on the desktop as an install, not as a portable copy", () => {
		// The installer lets the user choose the directory, so an install
		// outside Program Files is ordinary. Only the uninstaller answers.
		const desktop = "C:/Users/bob/Desktop/VLC Discord RP/resources"

		expect(detectInstallKind(probeInstall({}, desktop, () => true))).toEqual({ kind: "installed" })
	})
})
