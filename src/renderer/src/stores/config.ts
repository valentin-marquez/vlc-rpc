import { persistentAtom } from "@nanostores/persistent"
import { logger } from "@renderer/lib/utils"
import type { AppConfig } from "@shared/types"
import { computed } from "nanostores"

// Create a store for app configuration
export const configStore = persistentAtom<AppConfig | null>("vlc-rpc:config", null, {
	encode: JSON.stringify,
	decode: JSON.parse,
})

// Helper to check if it's the first run
export const isFirstRun = computed(configStore, (config) => {
	return config === null || config.isFirstRun === true
})

// Load configuration from the main process
export async function loadConfig(): Promise<void> {
	try {
		const config = await window.api.config.get<AppConfig>()
		configStore.set(config)
		logger.info("Configuration loaded")
	} catch (error) {
		logger.error(`Failed to load configuration: ${error}`)
	}
}

// Save configuration to the main process
export async function saveConfig(key: string, value: unknown): Promise<void> {
	try {
		await window.api.config.set(key, value)
		// Update local store with new value
		const currentConfig = configStore.get()
		if (currentConfig) {
			// @ts-ignore - we know this is safe
			configStore.set({ ...currentConfig, [key]: value })
		}
		logger.info(`Configuration saved: ${key}`)
	} catch (error) {
		logger.error(`Failed to save configuration: ${key} - ${error}`)
	}
}

// Save entire configuration object to the main process
export async function saveFullConfig(config: Partial<AppConfig>): Promise<void> {
	const currentConfig = configStore.get()
	const newConfig = { ...currentConfig, ...config }

	try {
		// Save each changed property to avoid race conditions
		for (const [key, value] of Object.entries(config)) {
			await window.api.config.set(key, value)
		}

		// Update local store
		configStore.set(newConfig as AppConfig)
		logger.info("Full configuration saved")
	} catch (error) {
		logger.error(`Failed to save full configuration: ${error}`)
	}
}
