import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import { useState } from "react"

type CacheState = { kind: "idle" } | { kind: "clearing" } | { kind: "cleared" } | { kind: "failed" }

const CACHE_IDLE =
	"Cover art the app has already downloaded. Clearing it frees space, and the app fetches what it needs again."

const CACHE_DESCRIPTION: Record<CacheState["kind"], string> = {
	idle: CACHE_IDLE,
	clearing: CACHE_IDLE,
	cleared: "Cleared. The app fetches cover art again as it needs it.",
	failed: "Could not clear the cache. Try again.",
}

interface AppSettingsPanelProps {
	config: AppConfig
	/**
	 * A portable copy has nothing to register at startup. It stays false while
	 * the install type is unknown, so the row never appears and then vanishes.
	 */
	canStartWithSystem: boolean
}

export function AppSettingsPanel({
	config,
	canStartWithSystem,
}: AppSettingsPanelProps): JSX.Element {
	const [cache, setCache] = useState<CacheState>({ kind: "idle" })

	async function handleToggleOption(option: "minimizeToTray" | "startWithSystem"): Promise<void> {
		try {
			await saveConfig(option, !config[option])
		} catch (error) {
			logger.error(`Failed to toggle ${option}: ${error}`)
		}
	}

	async function handleClearMetadataCache(): Promise<void> {
		setCache({ kind: "clearing" })
		try {
			// The handler resolves with success false when it could not clear, and
			// only throws when the call itself failed. Reading one and not the other
			// is how a locked file reported "Cleared."
			const result = await window.api.metadata.clearCache()
			setCache(result.success ? { kind: "cleared" } : { kind: "failed" })
		} catch (error) {
			logger.error(`Failed to clear the cover art cache: ${error}`)
			setCache({ kind: "failed" })
		}
	}

	return (
		<Panel label="App">
			<Row
				htmlFor="minimizeToTray"
				label="Keep running in the tray when you minimize"
				description="Closing the window still quits the app."
				control={
					<Switch
						id="minimizeToTray"
						checked={config.minimizeToTray}
						onChange={() => handleToggleOption("minimizeToTray")}
					/>
				}
			/>

			{canStartWithSystem && (
				<Row
					htmlFor="startWithSystem"
					label="Start when Windows starts"
					description="The app is already running when you open your first file."
					control={
						<Switch
							id="startWithSystem"
							checked={config.startWithSystem}
							onChange={() => handleToggleOption("startWithSystem")}
						/>
					}
				/>
			)}

			<Row
				label="Cover art cache"
				description={
					<span
						aria-live="polite"
						className={cache.kind === "failed" ? "text-danger-text" : undefined}
					>
						{CACHE_DESCRIPTION[cache.kind]}
					</span>
				}
				control={
					<Button
						variant="secondary"
						size="sm"
						onClick={handleClearMetadataCache}
						isLoading={cache.kind === "clearing"}
					>
						Clear
					</Button>
				}
			/>
		</Panel>
	)
}
