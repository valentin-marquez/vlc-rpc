import { persistentAtom } from "@nanostores/persistent"
import { logger } from "@renderer/lib/utils"
import type { AppConfig } from "@shared/config/app-config"
import { computed } from "nanostores"

export const configStore = persistentAtom<AppConfig | null>("vlc-rpc:config", null, {
	encode: JSON.stringify,
	decode: JSON.parse,
})

export const isFirstRun = computed(configStore, (config) => {
	return config === null || config.isFirstRun === true
})

export async function loadConfig(): Promise<void> {
	try {
		const config = await window.api.config.get<AppConfig>()
		configStore.set(config)
		logger.info("Configuration loaded")
	} catch (error) {
		logger.error(`Failed to load configuration: ${error}`)
	}
}

export async function saveConfig<K extends keyof AppConfig>(
	key: K,
	value: AppConfig[K],
): Promise<void> {
	try {
		await window.api.config.set(key, value)
	} catch (error) {
		logger.error(`Failed to save configuration: ${key} - ${error}`)
		// Swallowing this here would let the caller report a save that never happened.
		throw error
	}

	const currentConfig = configStore.get()
	if (currentConfig) {
		configStore.set({ ...currentConfig, [key]: value })
	}
	logger.info(`Configuration saved: ${key}`)
}

export async function saveFullConfig(config: Partial<AppConfig>): Promise<void> {
	const currentConfig = configStore.get()
	const newConfig = { ...currentConfig, ...config }

	try {
		for (const [key, value] of Object.entries(config)) {
			await window.api.config.set(key, value)
		}

		configStore.set(newConfig as AppConfig)
		logger.info("Full configuration saved")
	} catch (error) {
		logger.error(`Failed to save full configuration: ${error}`)
	}
}
