import type { AppConfig } from "@shared/config/app-config"
import { CONFIG_NAME, DEFAULT_CONFIG } from "@shared/config/defaults"

import { Conf } from "electron-conf/main"
import { registerHandler } from "./ipc"
import { logger } from "./logger"

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
	}

	public static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService()
		}
		return ConfigService.instance
	}

	private registerIpcHandlers(): void {
		registerHandler("config:get", (key?) => {
			if (key) {
				return this.conf.get(key)
			}
			return this.conf.store
		})

		registerHandler("config:set", (key, value) => {
			this.conf.set(key, value)
			// The value stays out of the log: config holds the VLC http password.
			logger.info(`Config updated: ${key}`)
			return true
		})
	}

	public get(): AppConfig
	public get<K extends keyof AppConfig>(key: K): AppConfig[K]
	public get<K extends keyof AppConfig>(key?: K): AppConfig | AppConfig[K] {
		if (key) {
			return this.conf.get(key)
		}
		return this.conf.store
	}

	public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
		this.conf.set(key, value)
		// The value stays out of the log: config holds the VLC http password.
		logger.info(`Config updated: ${key}`)
	}

	public delete<K extends keyof AppConfig>(key: K): void {
		this.conf.delete(key)
		logger.info(`Config deleted: ${key}`)
	}
}

export const configService = ConfigService.getInstance()
