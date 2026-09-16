import type { Clock } from "@main/core/clock"
import type { AppConfig } from "@shared/config/app-config"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import { afterEach, describe, expect, it, vi } from "vitest"

const { store } = vi.hoisted(() => ({
	store: { value: {} as Record<string, unknown> },
}))

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

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

import { Client } from "./discord.client"

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

function makeClient() {
	store.value = { rpcEnabled: true }
	const clock = new FakeClock()
	return { client: new Client(clock), clock }
}

afterEach(() => {
	store.value = {}
})

describe("Discord Client RPC state", () => {
	it("reports the presence enabled by default", () => {
		const { client } = makeClient()

		expect(client.isRpcEnabled()).toBe(true)
	})

	it("reports it off after disableRpc and on again after enableRpc", () => {
		const { client } = makeClient()

		client.disableRpc()
		expect(client.isRpcEnabled()).toBe(false)

		client.enableRpc()
		expect(client.isRpcEnabled()).toBe(true)
	})

	it("stays off for the whole temporary window and comes back on after it", () => {
		const { client, clock } = makeClient()

		client.disableRpcTemporary(30)
		expect(client.isRpcEnabled()).toBe(false)

		clock.advance(HALF_HOUR_MS - 1000)
		expect(client.isRpcEnabled()).toBe(false)

		clock.advance(1000)
		expect(client.isRpcEnabled()).toBe(true)
	})

	it("keeps the presence off during a temporary window even if rpcEnabled says true", () => {
		const { client } = makeClient()

		client.disableRpcTemporary(30)

		expect(store.value.rpcEnabled).toBe(true)
		expect(client.isRpcEnabled()).toBe(false)
	})

	it("drops the elapsed rpcDisabledUntil instead of leaving it in the config", () => {
		const { client, clock } = makeClient()

		client.disableRpcTemporary(30)
		clock.advance(HALF_HOUR_MS)

		expect(client.isRpcEnabled()).toBe(true)
		expect(store.value.rpcDisabledUntil).toBeUndefined()
	})

	it("clears a pending temporary window when the presence is enabled by hand", () => {
		const { client } = makeClient()

		client.disableRpcTemporary(30)
		client.enableRpc()

		expect(store.value.rpcDisabledUntil).toBeUndefined()
		expect(client.isRpcEnabled()).toBe(true)
	})

	it("refuses to send an update while the presence is disabled", async () => {
		const { client } = makeClient()
		const presence: DiscordPresenceData = { details: "x", state: "y" }

		client.disableRpc()

		expect(await client.update(presence)).toBe(false)
		expect(client.isConnected()).toBe(false)
	})
})
