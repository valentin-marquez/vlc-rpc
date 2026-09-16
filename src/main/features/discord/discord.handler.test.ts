import type { Clock } from "@main/core/clock"
import type { Service as PresenceService } from "@main/features/presence"
import type { Client as VlcClient } from "@main/features/vlc"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Client as DiscordClient } from "./discord.client"

const { mockPresenceUpdateInterval } = vi.hoisted(() => ({
	mockPresenceUpdateInterval: { value: 1500 },
}))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

vi.mock("@main/core/config", () => ({
	configService: {
		get: (key?: string) =>
			key === "presenceUpdateInterval" ? mockPresenceUpdateInterval.value : {},
		set: () => {},
		delete: () => {},
	},
}))

// The presence barrel reaches the catalog cache, which opens its own Conf store.
vi.mock("electron-conf/main", () => ({
	Conf: class {
		get(): Record<string, never> {
			return {}
		}
		set(): void {}
	},
}))

afterEach(() => {
	vi.useRealTimers()
	mockPresenceUpdateInterval.value = 1500
})

import { DiscordRpcHandler } from "./discord.handler"

class FakeClock implements Clock {
	private currentMs = 0

	now(): number {
		return this.currentMs
	}

	advance(ms: number): void {
		this.currentMs += ms
	}
}

function status(overrides: Partial<VlcStatus> = {}): VlcStatus {
	return {
		active: true,
		status: "playing",
		timestamp: 0,
		plid: 3,
		playback: { position: 10, time: 10, duration: 200, rate: 1 },
		mediaType: "audio",
		media: { title: "Probablemente" },
		...overrides,
	}
}

function fakeDiscord(connected = true) {
	const calls = { update: 0, clear: 0, connect: 0 }
	let isConnected = connected
	const client = {
		isConnected: () => isConnected,
		connect: async () => {
			calls.connect++
			isConnected = true
			return true
		},
		update: async () => {
			calls.update++
			return true
		},
		clear: async () => {
			calls.clear++
			return true
		},
	}
	return {
		client: client as unknown as DiscordClient,
		calls,
		setConnected: (value: boolean) => {
			isConnected = value
		},
	}
}

function fakeVlc(getStatus: () => VlcStatus | null) {
	return { readStatus: async () => getStatus() } as unknown as VlcClient
}

function fakePresence() {
	const data: DiscordPresenceData = { details: "x", state: "y" }
	return { getDiscordPresence: async () => data } as unknown as PresenceService
}

describe("DiscordRpcHandler update loop", () => {
	it("sends once for the initial tick, then skips an unchanged one", async () => {
		vi.useFakeTimers()
		const discord = fakeDiscord()
		const vlc = fakeVlc(() => status())
		const handler = new DiscordRpcHandler(discord.client, vlc, fakePresence(), new FakeClock())

		handler.startUpdateLoop()
		await vi.advanceTimersByTimeAsync(0)
		expect(discord.calls.update).toBe(1)

		await vi.advanceTimersByTimeAsync(1500)
		expect(discord.calls.update).toBe(1)
	})

	it("sends again when plid changes, a new track", async () => {
		vi.useFakeTimers()
		const discord = fakeDiscord()
		let currentStatus = status({ plid: 3 })
		const vlc = fakeVlc(() => currentStatus)
		const handler = new DiscordRpcHandler(discord.client, vlc, fakePresence(), new FakeClock())

		handler.startUpdateLoop()
		await vi.advanceTimersByTimeAsync(0)
		expect(discord.calls.update).toBe(1)

		currentStatus = status({ plid: 4 })
		await vi.advanceTimersByTimeAsync(1500)
		expect(discord.calls.update).toBe(2)
	})

	it("forces a resend after a reconnect, even with an unchanged presenceKey", async () => {
		vi.useFakeTimers()
		const discord = fakeDiscord()
		const vlc = fakeVlc(() => status())
		const handler = new DiscordRpcHandler(discord.client, vlc, fakePresence(), new FakeClock())

		handler.startUpdateLoop()
		await vi.advanceTimersByTimeAsync(0)
		expect(discord.calls.update).toBe(1)

		discord.setConnected(false)
		await vi.advanceTimersByTimeAsync(1500)
		discord.setConnected(true)
		await vi.advanceTimersByTimeAsync(1500)

		expect(discord.calls.update).toBe(2)
	})

	it("clears the presence when VLC reports no status", async () => {
		vi.useFakeTimers()
		const discord = fakeDiscord()
		const vlc = fakeVlc(() => null)
		const handler = new DiscordRpcHandler(discord.client, vlc, fakePresence(), new FakeClock())

		handler.startUpdateLoop()
		await vi.advanceTimersByTimeAsync(0)

		expect(discord.calls.clear).toBe(1)
		expect(discord.calls.update).toBe(0)
	})

	it("clamps a stale, pre-existing presenceUpdateInterval of 1ms up to the 500ms floor", async () => {
		mockPresenceUpdateInterval.value = 1
		vi.useFakeTimers()
		const setIntervalSpy = vi.spyOn(global, "setInterval")
		const discord = fakeDiscord()
		const vlc = fakeVlc(() => status())
		const handler = new DiscordRpcHandler(discord.client, vlc, fakePresence(), new FakeClock())

		handler.startUpdateLoop()

		const intervalCall = setIntervalSpy.mock.calls.find(([, ms]) => ms === 500)
		expect(intervalCall).toBeDefined()

		setIntervalSpy.mockRestore()
	})
})
