import { SystemClock } from "@main/core/clock"
import type { UpdateAvailability } from "@shared/updates/update.types"
import type { BrowserWindow } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InstallKind } from "./updates.install-kind"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const INSTALLED: InstallKind = { kind: "installed" }
const PORTABLE: InstallKind = { kind: "portable", reason: "portable-launcher" }

const { state, updaterMock, logCalls, electronMock } = vi.hoisted(() => {
	const state = {
		checkBehavior: "available" as "available" | "none" | "fails" | "hangs",
		availableVersion: "5.0.0",
	}
	const listeners = new Map<string, Array<(payload: unknown) => void>>()
	const logCalls: Array<{ level: string; message: string; args: unknown[] }> = []

	const emit = (event: string, payload?: unknown): void => {
		for (const listener of listeners.get(event) ?? []) listener(payload)
	}

	const autoUpdater = {
		logger: null as unknown,
		autoDownload: true,
		autoInstallOnAppQuit: true,
		updateConfigPath: "",
		forceDevUpdateConfig: false,
		on(event: string, listener: (payload: unknown) => void): void {
			const list = listeners.get(event) ?? []
			list.push(listener)
			listeners.set(event, list)
		},
		checkForUpdates: vi.fn(async () => {
			emit("checking-for-update")

			if (state.checkBehavior === "hangs") {
				return new Promise(() => {})
			}
			if (state.checkBehavior === "fails") {
				const error = new Error("net::ERR_INTERNET_DISCONNECTED https://github.com/o/r/latest.yml")
				emit("error", error)
				throw error
			}
			if (state.checkBehavior === "none") {
				emit("update-not-available", { version: "4.0.2" })
				return null
			}

			emit("update-available", { version: state.availableVersion, releaseDate: "2026-09-17" })
			return { updateInfo: { version: state.availableVersion } }
		}),
		downloadUpdate: vi.fn(async () => []),
		quitAndInstall: vi.fn(),
	}

	return {
		state,
		logCalls,
		updaterMock: {
			autoUpdater,
			emit,
			reset(): void {
				listeners.clear()
				autoUpdater.checkForUpdates.mockClear()
				autoUpdater.downloadUpdate.mockClear()
				autoUpdater.quitAndInstall.mockClear()
				autoUpdater.autoDownload = true
				autoUpdater.autoInstallOnAppQuit = true
			},
		},
		electronMock: {
			showMessageBox: vi.fn(),
			openExternal: vi.fn(async (_url: string) => {}),
			openPath: vi.fn(async (_path: string) => ""),
		},
	}
})

vi.mock("@main/core/logger", () => ({
	logger: {
		info: (message: string, ...args: unknown[]) => logCalls.push({ level: "info", message, args }),
		warn: (message: string, ...args: unknown[]) => logCalls.push({ level: "warn", message, args }),
		error: (message: string, ...args: unknown[]) =>
			logCalls.push({ level: "error", message, args }),
	},
}))

vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }))

vi.mock("electron-updater", () => ({ autoUpdater: updaterMock.autoUpdater }))

vi.mock("electron", () => ({
	app: {
		getVersion: () => "4.0.2",
		getPath: () => "C:/users/bob/AppData/Roaming/vlc-rpc",
	},
	dialog: {
		showMessageBox: (...args: unknown[]) => {
			electronMock.showMessageBox(...args)
			return Promise.resolve({ response: 0 })
		},
	},
	shell: {
		openExternal: electronMock.openExternal,
		openPath: electronMock.openPath,
	},
}))

import { Updater } from "./app.updater"

type WindowEvent = "show" | "focus"

function makeWindow(visible = true) {
	const handlers = new Map<string, Array<() => void>>()

	const window = {
		isVisible: () => visible,
		isDestroyed: () => false,
		on(event: string, handler: () => void) {
			const list = handlers.get(event) ?? []
			list.push(handler)
			handlers.set(event, list)
			return window
		},
		webContents: { send: vi.fn() },
	}

	return {
		window: window as unknown as BrowserWindow,
		sent: window.webContents.send,
		announced(): UpdateAvailability[] {
			return window.webContents.send.mock.calls
				.filter(([channel]) => channel === "update:availability")
				.map(([, payload]) => payload as UpdateAvailability)
		},
		emit(event: WindowEvent): void {
			for (const handler of handlers.get(event) ?? []) handler()
		},
	}
}

function makeUpdater(options: { portable?: boolean; visible?: boolean } = {}) {
	// Start from the wrong value so the assertions on it mean something.
	updaterMock.autoUpdater.autoInstallOnAppQuit = options.portable === true

	const fakeWindow = makeWindow(options.visible ?? true)
	const updater = new Updater(new SystemClock(), options.portable === true ? PORTABLE : INSTALLED)
	updater.setMainWindow(fakeWindow.window)

	return { updater, ...fakeWindow }
}

beforeEach(() => {
	vi.useFakeTimers()
	updaterMock.reset()
	electronMock.showMessageBox.mockClear()
	electronMock.openExternal.mockClear()
	electronMock.openPath.mockClear()
	logCalls.length = 0
	state.checkBehavior = "available"
	state.availableVersion = "5.0.0"
})

afterEach(() => {
	vi.useRealTimers()
})

const checks = () => updaterMock.autoUpdater.checkForUpdates.mock.calls.length

describe("A long running install noticing a release", () => {
	it("checks shortly after start and then keeps checking on its own", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "none"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		expect(checks()).toBe(1)

		await vi.advanceTimersByTimeAsync(6 * HOUR_MS)
		expect(checks()).toBe(2)

		await vi.advanceTimersByTimeAsync(6 * HOUR_MS)
		expect(checks()).toBe(3)

		updater.stop()
	})

	it("stops checking once the app is stopping", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "none"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		updater.stop()

		await vi.advanceTimersByTimeAsync(24 * HOUR_MS)
		expect(checks()).toBe(1)
	})

	it("never runs two checks at once", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "hangs"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		expect(checks()).toBe(1)

		await updater.checkForUpdates(true)
		await vi.advanceTimersByTimeAsync(12 * HOUR_MS)

		expect(checks()).toBe(1)
		updater.stop()
	})

	it("checks when the window is opened, but not on every open", async () => {
		const { updater, emit } = makeUpdater()
		state.checkBehavior = "none"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		expect(checks()).toBe(1)

		emit("show")
		await vi.advanceTimersByTimeAsync(0)
		expect(checks()).toBe(1)

		await vi.advanceTimersByTimeAsync(31 * MINUTE_MS)
		emit("show")
		await vi.advanceTimersByTimeAsync(0)
		expect(checks()).toBe(2)

		updater.stop()
	})
})

describe("GitHub being unreachable", () => {
	it("retries on a widening delay instead of hammering", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "fails"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		expect(checks()).toBe(1)

		await vi.advanceTimersByTimeAsync(59 * 1000)
		expect(checks()).toBe(1)

		await vi.advanceTimersByTimeAsync(1000)
		expect(checks()).toBe(2)

		await vi.advanceTimersByTimeAsync(5 * MINUTE_MS)
		expect(checks()).toBe(3)

		await vi.advanceTimersByTimeAsync(15 * MINUTE_MS)
		expect(checks()).toBe(4)

		// Out of attempts: the next request waits for the ordinary cadence.
		await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
		expect(checks()).toBe(4)

		updater.stop()
	})

	it("drops a pending retry when the app stops", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "fails"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		updater.stop()

		await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
		expect(checks()).toBe(1)
	})

	it("does not retry the check when the failure came from the download", async () => {
		const { updater } = makeUpdater()

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		updater.downloadUpdate()
		expect(updaterMock.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)

		updaterMock.emit("error", new Error("download died"))
		await vi.advanceTimersByTimeAsync(2 * HOUR_MS)

		expect(checks()).toBe(1)
		updater.stop()
	})

	it("tells a user who asked for the check, without quoting the error back", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "fails"

		await updater.forceCheckForUpdates()
		await vi.advanceTimersByTimeAsync(0)

		expect(electronMock.showMessageBox).toHaveBeenCalledTimes(1)
		const options = JSON.stringify(electronMock.showMessageBox.mock.calls[0]?.[1])
		expect(options).toContain("Update Error")
		expect(options).not.toContain("github.com")
		expect(options).not.toContain("net::ERR")
	})

	it("logs the name of a failure, never the error and never a url", async () => {
		const { updater } = makeUpdater()
		state.checkBehavior = "fails"

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		updater.stop()

		const serialized = JSON.stringify(logCalls)
		expect(serialized).not.toContain("github.com")
		expect(logCalls.flatMap((call) => call.args).some((arg) => arg instanceof Error)).toBe(false)
		expect(logCalls.some((call) => JSON.stringify(call.args).includes("net::ERR"))).toBe(false)
		expect(logCalls.some((call) => JSON.stringify(call).includes("Error"))).toBe(true)
	})
})

describe("Announcing a release", () => {
	it("says so once per version, not on every check", async () => {
		const { updater, announced } = makeUpdater()

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		await vi.advanceTimersByTimeAsync(6 * HOUR_MS)
		await vi.advanceTimersByTimeAsync(6 * HOUR_MS)

		expect(announced()).toEqual([{ kind: "available", version: "5.0.0" }])

		updater.stop()
	})

	it("interrupts nobody: the release is state the window can come and ask for", async () => {
		// The check runs three seconds after the app starts, which is before the
		// window has finished loading, and the push is made once. A renderer that
		// mounts later reads this instead of missing the release entirely.
		const updater = new Updater(new SystemClock(), INSTALLED)

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		expect(electronMock.showMessageBox).not.toHaveBeenCalled()
		expect(updater.getCurrentUpdate()).toEqual({ kind: "available", version: "5.0.0" })

		updater.stop()
	})

	it("keeps the release while the window is closed", async () => {
		const { updater } = makeUpdater({ visible: false })

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		expect(updater.getCurrentUpdate()).toEqual({ kind: "available", version: "5.0.0" })

		updater.stop()
	})

	it("forgets it when a later check says the release is gone", async () => {
		const { updater } = makeUpdater()

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)
		expect(updater.getCurrentUpdate().kind).toBe("available")

		state.checkBehavior = "none"
		await vi.advanceTimersByTimeAsync(6 * HOUR_MS)

		expect(updater.getCurrentUpdate()).toEqual({ kind: "none" })

		updater.stop()
	})

	it("downloads nothing until it is asked to", async () => {
		const { updater } = makeUpdater()

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		expect(updaterMock.autoUpdater.autoDownload).toBe(false)
		expect(updaterMock.autoUpdater.downloadUpdate).not.toHaveBeenCalled()

		updater.stop()
	})
})

describe("An installed copy taking the update", () => {
	it("reports the download as it runs, and restarts once it lands", async () => {
		const { updater, announced } = makeUpdater()

		expect(updater.getInstallationType()).toBe("setup")
		expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(true)

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		updater.downloadUpdate()
		updaterMock.emit("download-progress", { percent: 41.7 })
		updaterMock.emit("update-downloaded", { version: "5.0.0" })
		await vi.advanceTimersByTimeAsync(10)

		expect(announced()).toEqual([
			{ kind: "available", version: "5.0.0" },
			{ kind: "downloading", version: "5.0.0", percent: 42 },
			{ kind: "ready", version: "5.0.0" },
		])
		// The press that started this said the app restarts to finish, so it does.
		expect(updaterMock.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)

		updater.stop()
	})

	it("names the version again when the download dies, so it can be taken up once more", async () => {
		const { updater } = makeUpdater()

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		updater.downloadUpdate()
		updaterMock.emit("download-progress", { percent: 12 })
		updaterMock.emit("error", new Error("download died"))

		expect(updater.getCurrentUpdate()).toEqual({ kind: "failed", version: "5.0.0" })
		expect(updaterMock.autoUpdater.quitAndInstall).not.toHaveBeenCalled()

		updater.stop()
	})
})

describe("A portable copy", () => {
	it("is offered the release page, not a download it cannot install", async () => {
		const { updater } = makeUpdater({ portable: true })

		expect(updater.getInstallationType()).toBe("portable")
		expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false)

		updater.start()
		await vi.advanceTimersByTimeAsync(3000)

		expect(updater.getCurrentUpdate()).toEqual({ kind: "available", version: "5.0.0" })
		expect(updaterMock.autoUpdater.downloadUpdate).not.toHaveBeenCalled()

		updater.stop()
	})

	it("refuses a download asked for from the renderer", async () => {
		const { updater } = makeUpdater({ portable: true })

		updater.downloadUpdate()
		await vi.advanceTimersByTimeAsync(0)

		expect(updaterMock.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
		expect(electronMock.openExternal).toHaveBeenCalledTimes(1)
		expect(String(electronMock.openExternal.mock.calls[0]?.[0])).toContain(
			"github.com/valentin-marquez/vlc-rpc/releases",
		)
	})

	it("refuses to install over itself", async () => {
		const { updater } = makeUpdater({ portable: true })

		updater.installNow()
		await vi.advanceTimersByTimeAsync(0)

		expect(updaterMock.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
		expect(electronMock.openExternal).toHaveBeenCalledTimes(1)
	})
})
