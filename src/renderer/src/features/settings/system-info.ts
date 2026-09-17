import { logger } from "@renderer/lib/utils"

export type SystemInfo =
	| { kind: "loading" }
	| { kind: "ready"; version: string; installedAs: "portable" | "setup"; isPortable: boolean }
	| { kind: "failed" }

/** Never rejects: a settings screen that cannot read its own version still renders. */
export async function readSystemInfo(): Promise<SystemInfo> {
	try {
		const [status, installedAs, isPortable] = await Promise.all([
			window.api.update.getStatus(),
			window.api.update.getInstallationType(),
			window.api.app.isPortable(),
		])

		return { kind: "ready", version: status.currentVersion, installedAs, isPortable }
	} catch (error) {
		logger.error(`Failed to read the app version and install type: ${error}`)
		return { kind: "failed" }
	}
}
