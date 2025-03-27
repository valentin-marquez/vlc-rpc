import { CONFIG_NAME, DEFAULT_CONFIG } from "@shared/constants"
import { type AppConfig, IpcChannels, IpcEvents } from "@shared/types"
import { ipcMain } from "electron"
import { Conf } from "electron-conf/main"
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
		ipcMain.handle(`${IpcChannels.CONFIG}:${IpcEvents.CONFIG_GET}`, (_, key?: string) => {
			if (key) {
				return this.conf.get(key)
			}
			// When no key is provided, return the full config using the store property
			return this.conf.store
		})

		ipcMain.handle(
			`${IpcChannels.CONFIG}:${IpcEvents.CONFIG_SET}`,
			(_, key: string, value: unknown) => {
				this.conf.set(key, value)
				logger.info(`Config updated: ${key}`, { value })
				return true
			},
		)
	}

	/**
	 * Get a configuration value
	 */
	public get<T>(key?: string): T {
		if (key) {
			return this.conf.get(key) as T
		}
		// When no key is provided, return the full config using the store property
		return this.conf.store as T
	}

	/**
	 * Set a configuration value
	 */
	public set(key: string, value: unknown): void {
		this.conf.set(key, value)
		logger.info(`Config updated: ${key}`, { value })
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
