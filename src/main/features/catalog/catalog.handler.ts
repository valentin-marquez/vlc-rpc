import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import { verifyKey } from "./catalog.tmdb"

/**
 * Handler for checking a TMDB API key before the user commits to it.
 */
export class TmdbKeyHandler {
	constructor() {
		this.registerHandlers()
	}

	private registerHandlers(): void {
		registerHandler("catalog:tmdb:verify", async (apiKey) => {
			const result = await verifyKey(apiKey)
			logger.info(`TMDB api key verification: ${result}`)
			return result
		})
	}
}
