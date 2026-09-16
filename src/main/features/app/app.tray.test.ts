import type { Clock } from "@main/core/clock"
import type { AppConfig } from "@shared/config/app-config"
import type { MenuItemConstructorOptions } from "electron"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Startup } from "./app.startup"

const { store, captured } = vi.hoisted(() => ({
	store: { value: {} as Record<string, unknown> },
	captured: { template: [] as MenuItemConstructorOptions[] },
}))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: keyof AppConfig) => (key ? store.value[key] : store.value),
		set: (key: keyof AppConfig, value: unknown) => {
			store.value[key] = value
		},
		delete: (key: keyof AppConfig) => {
			delete store.value[key]
		},
	},
}))

vi.mock("@electron-toolkit/utils", () => ({ is: { dev: true } }))

vi.mock("../../../../resources/icons/16x16.png?asset", () => ({ default: "icon.png" }))

// The presence barrel, reached through the discord barrel, opens its own Conf store.
vi.mock("electron-conf/main", () => ({
	Conf: class {
		get(): Record<string, never> {
			return {}
		}
		set(): void {}
	},
}))

vi.mock("electron", () => ({
	Tray: class {
		setIgnoreDoubleClickEvents(): void {}
		setToolTip(): void {}
		setContextMenu(): void {}
		on(): void {}
		isDestroyed(): boolean {
			return false
		}
		destroy(): void {}
	},
	Menu: {
		buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
			captured.template = template
			return {}
		},
	},
	app: {
		isReady: () => true,
		whenReady: async () => {},
		on: () => {},
		quit: () => {},
		getVersion: () => "0.0.0-test",
	},
	nativeImage: {
		createFromPath: () => ({ isEmpty: () => false }),
		createFromBuffer: () => ({}),
	},
	powerMonitor: { on: () => {} },
}))

import { Client as DiscordClient } from "@main/features/discord"
import { Tray } from "./app.tray"

class FakeClock implements Clock {
	private currentMs = 0

	now(): number {
		return this.currentMs
	}

	advance(ms: number): void {
		this.currentMs += ms
	}
}

const HALF_HOUR_MS = 30 * 60 * 1000

const fakeStartup = {
	isPortable: () => false,
	setStartAtLogin: () => {},
} as unknown as Startup

function makeTray() {
	store.value = { rpcEnabled: true, minimizeToTray: true, startWithSystem: false }
	captured.template = []
	vi.useFakeTimers()

	const clock = new FakeClock()
	const discord = new DiscordClient(clock)
	const tray = new Tray(fakeStartup, discord)

	return { tray, discord, clock }
}

function rpcItem(): MenuItemConstructorOptions {
	const item = captured.template.find((entry) =>
		typeof entry.label === "string" ? entry.label.startsWith("Rich Presence") : false,
	)
	if (!item) {
		throw new Error("The tray menu has no Rich Presence entry")
	}
	return item
}

afterEach(() => {
	vi.useRealTimers()
	store.value = {}
})

describe("Tray Rich Presence entry", () => {
	it("agrees with the client while the presence is enabled", () => {
		const { discord } = makeTray()

		expect(rpcItem().checked).toBe(discord.isRpcEnabled())
		expect(rpcItem().label).toBe("Rich Presence")
	})

	it("agrees with the client after a permanent disable", () => {
		const { tray, discord } = makeTray()

		discord.disableRpc()
		tray.updateContextMenu()

		expect(discord.isRpcEnabled()).toBe(false)
		expect(rpcItem().checked).toBe(false)
		expect(rpcItem().label).toBe("Rich Presence (off)")
	})

	it("agrees with the client inside a temporary window and again after it", () => {
		const { tray, discord, clock } = makeTray()

		discord.disableRpcTemporary(30)
		tray.updateContextMenu()

		expect(discord.isRpcEnabled()).toBe(false)
		expect(rpcItem().checked).toBe(false)
		expect(rpcItem().label).toContain("off until")

		clock.advance(HALF_HOUR_MS)
		tray.updateContextMenu()

		expect(discord.isRpcEnabled()).toBe(true)
		expect(rpcItem().checked).toBe(true)
		expect(rpcItem().label).toBe("Rich Presence")
	})

	it("refreshes the menu on its own when a temporary window elapses", async () => {
		const { tray, discord, clock } = makeTray()

		discord.disableRpcTemporary(30)
		tray.updateContextMenu()
		expect(rpcItem().checked).toBe(false)

		clock.advance(HALF_HOUR_MS)
		await vi.advanceTimersByTimeAsync(10000)

		expect(rpcItem().checked).toBe(true)
		expect(store.value.rpcDisabledUntil).toBeUndefined()
	})
})
