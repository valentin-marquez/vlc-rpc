import { app } from "electron"
import { logger } from "./logger"

/**
 * Service to manage application startup with system
 */
export class StartupService {
	private static instance: StartupService | null = null

	private constructor() {}

	/**
	 * Get the singleton instance of the startup service
	 */
	public static getInstance(): StartupService {
		if (!StartupService.instance) {
			StartupService.instance = new StartupService()
		}
		return StartupService.instance
	}

	/**
	 * Check if the application is running as portable version
	 */
	public isPortable(): boolean {
		// Check if executable name contains "portable"
		const execPath = process.execPath.toLowerCase()
		return execPath.includes("portable")
	}

	/**
	 * Set whether the application should start at login
	 * Only works for non-portable versions
	 */
	public setStartAtLogin(enable: boolean): void {
		try {
			if (!app.isPackaged) {
				logger.warn("Not setting start at login in development mode")
				return
			}

			if (this.isPortable()) {
				logger.warn("Start at login is not available for portable version")
				return
			}

			app.setLoginItemSettings({
				openAtLogin: enable,
				path: process.execPath,
			})
			logger.info(`Set start at login: ${enable}`)
		} catch (error) {
			logger.error(`Failed to set start at login: ${error}`)
		}
	}

	/**
	 * Get whether the application starts at login
	 */
	public getStartAtLogin(): boolean {
		try {
			if (app.isPackaged) {
				return app.getLoginItemSettings().openAtLogin
			}
			return false
		} catch (error) {
			logger.error(`Failed to get start at login status: ${error}`)
			return false
		}
	}
}

export const startupService = StartupService.getInstance()
