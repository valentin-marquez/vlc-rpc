import { logger } from "@main/core/logger"
import type { InstallKind } from "@main/features/updates"
import { app } from "electron"

/**
 * Service to manage application startup with system
 */
export class Startup {
	/**
	 * The install kind is decided once in the composition root and handed to
	 * everything that asks. Reading it off the executable path was a guess that
	 * was wrong in both directions: a portable copy in a folder not named
	 * "portable" was offered start at login, which writes a registry entry
	 * pointing at a file the user is free to move, and an install under a folder
	 * like C:\PortableApps lost start at login for no reason.
	 */
	constructor(private readonly install: InstallKind) {}

	/**
	 * Check if the application is running as portable version
	 */
	public isPortable(): boolean {
		return this.install.kind === "portable"
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
