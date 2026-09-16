import { Button } from "@renderer/components/ui/button"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import { useEffect, useState } from "react"

interface AppSettingsPanelProps {
	config: AppConfig
}

export function AppSettingsPanel({ config }: AppSettingsPanelProps): JSX.Element {
	const [isLoading, setIsLoading] = useState(false)
	const [isPortable, setIsPortable] = useState(false)
	const [currentVersion, setCurrentVersion] = useState<string>("")
	const [installationType, setInstallationType] = useState<"portable" | "setup" | null>(null)

	useEffect(() => {
		const checkBasicInfo = async (): Promise<void> => {
			try {
				const [portable, updateStatus, installType] = await Promise.all([
					window.api.app.isPortable(),
					window.api.update.getStatus(),
					window.api.update.getInstallationType(),
				])

				setIsPortable(portable)
				setCurrentVersion(updateStatus.currentVersion)
				setInstallationType(installType)
			} catch (error) {
				logger.error(`Failed to check basic info: ${error}`)
			}
		}
		checkBasicInfo()
	}, [])

	async function handleToggleOption(option: "minimizeToTray" | "startWithSystem"): Promise<void> {
		try {
			const newValue = !config[option]
			await saveConfig(option, newValue)
		} catch (error) {
			logger.error(`Failed to toggle ${option}: ${error}`)
		}
	}

	async function handleClearMetadataCache(): Promise<void> {
		setIsLoading(true)
		try {
			await window.api.metadata.clearCache()
			logger.info("Metadata cache cleared successfully")
		} catch (error) {
			logger.error(`Failed to clear metadata cache: ${error}`)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
			<div className="border-b border-border px-4 py-3">
				<h2 className="font-semibold">Application Settings</h2>
			</div>
			<div className="p-4 space-y-4">
				<div className="bg-background p-3 rounded-md space-y-2">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium text-card-foreground">Current Version</p>
						<span className="text-sm text-muted-foreground">{currentVersion || "Loading..."}</span>
					</div>
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium text-card-foreground">Installation Type</p>
						<span className="text-sm text-muted-foreground">
							{installationType || "Loading..."}
						</span>
					</div>
				</div>

				<div className="flex items-center justify-between bg-background p-3 rounded-md">
					<div>
						<p className="text-sm font-medium text-card-foreground">Minimize to Tray</p>
						<p className="text-xs text-muted-foreground">
							Keep the app running in the system tray when minimized (not when closed)
						</p>
					</div>
					<Switch
						checked={config.minimizeToTray}
						onChange={() => handleToggleOption("minimizeToTray")}
					/>
				</div>

				{!isPortable && (
					<div className="flex items-center justify-between bg-background p-3 rounded-md">
						<div>
							<p className="text-sm font-medium text-card-foreground">Start with System</p>
							<p className="text-xs text-muted-foreground">
								Launch automatically when your computer starts
							</p>
						</div>
						<Switch
							checked={config.startWithSystem}
							onChange={() => handleToggleOption("startWithSystem")}
						/>
					</div>
				)}

				<div className="flex items-center justify-between bg-background p-3 rounded-md">
					<div>
						<p className="text-sm font-medium text-card-foreground">Clear Metadata Cache</p>
						<p className="text-xs text-muted-foreground">
							Free up space by clearing stored cover art metadata
						</p>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleClearMetadataCache}
						disabled={isLoading}
					>
						{isLoading ? "Clearing..." : "Clear Cache"}
					</Button>
				</div>
			</div>
		</section>
	)
}
