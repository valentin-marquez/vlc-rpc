import type { AppConfig } from "@shared/config/app-config"
import { CONFIG_NAME, DEFAULT_CONFIG } from "@shared/config/defaults"

import { Conf } from "electron-conf/main"
import { registerHandler } from "./ipc"
import { logger } from "./logger"

/**
 * Configuration service for the application
 */
class ConfigService {
	private static instance: ConfigService | null = null
	private conf: Conf<AppConfig>

	private constructor() {
		this.conf = new Conf<AppConfig>({
			name: CONFIG_NAME,
			defaults: DEFAULT_CONFIG,
		})

		logger.info("Configuration loaded", { path: this.conf.fileName })

		this.registerIpcHandlers()
		this.conf.registerRendererListener()
	}

	/**
	 * Get the singleton instance of the config service
	 */
	public static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService()
		}
		return ConfigService.instance
	}

	/**
	 * Register IPC handlers for config operations
	 */
	private registerIpcHandlers(): void {
		registerHandler("config:get", (key?) => {
			if (key) {
				return this.conf.get(key)
			}
			return this.conf.store
		})

		registerHandler("config:set", (key, value) => {
			this.conf.set(key, value)
			logger.info(`Config updated: ${key}`, { value })
			return true
		})
	}

	/**
	 * Get the full configuration
	 */
	public get(): AppConfig
	/**
	 * Get a single configuration value
	 */
	public get<K extends keyof AppConfig>(key: K): AppConfig[K]
	public get<K extends keyof AppConfig>(key?: K): AppConfig | AppConfig[K] {
		if (key) {
			return this.conf.get(key)
		}
		return this.conf.store
	}

	/**
	 * Set a configuration value
	 */
	public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
		this.conf.set(key, value)
		logger.info(`Config updated: ${key}`, { value })
	}

	/**
	 * Delete a configuration value
	 */
	public delete<K extends keyof AppConfig>(key: K): void {
		this.conf.delete(key)
		logger.info(`Config deleted: ${key}`)
	}

	/**
	 * Reset configuration to defaults
	 */
	public reset(): void {
		this.conf.clear()
		logger.info("Config reset to defaults")
	}
}

export const configService = ConfigService.getInstance()
