import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { configStore, saveConfig } from "@renderer/stores/config"
import { saveVlcConfig } from "@renderer/stores/vlc"
import { useState } from "react"

export function Settings(): JSX.Element {
	const config = useStore(configStore)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showPassword, setShowPassword] = useState(false)

	if (!config) {
		return <div className="p-6 text-center text-foreground">Loading configuration...</div>
	}

	async function handleVlcConfigUpdate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setIsSubmitting(true)

		try {
			const form = event.currentTarget
			const formData = new FormData(form)

			const vlcConfig = {
				httpPort: Number(formData.get("httpPort")),
				httpPassword: formData.get("httpPassword") as string,
				httpEnabled: Boolean(formData.get("httpEnabled")),
			}

			await saveVlcConfig(vlcConfig)
			logger.info("VLC configuration updated")
		} catch (error) {
			logger.error(`Failed to update VLC configuration: ${error}`)
		} finally {
			setIsSubmitting(false)
		}
	}

	async function handleToggleOption(option: "minimizeToTray" | "startWithSystem") {
		if (!config) return
		try {
			const newValue = !config[option]
			await saveConfig(option, newValue)
		} catch (error) {
			logger.error(`Failed to toggle ${option}: ${error}`)
		}
	}

	return (
		<div className="max-w-6xl mx-auto">
			<div className="mb-6">
				<h1 className="text-2xl font-bold mb-1">Settings</h1>
				<p className="text-muted-foreground">Configure VLC Discord Rich Presence</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
					<div className="border-b border-border px-4 py-3">
						<h2 className="font-semibold">VLC Configuration</h2>
					</div>
					<div className="p-4">
						<form onSubmit={handleVlcConfigUpdate} className="space-y-4">
							<div className="space-y-2">
								<label className="text-sm font-medium text-card-foreground" htmlFor="httpPort">
									HTTP Port
								</label>
								<Input
									id="httpPort"
									name="httpPort"
									type="number"
									defaultValue={config.vlc.httpPort}
									min="1"
									max="65535"
									className="focus-discord"
								/>
								<p className="text-xs text-muted-foreground">Port for VLC HTTP interface</p>
							</div>

							<div className="space-y-2">
								<label className="text-sm font-medium text-card-foreground" htmlFor="httpPassword">
									HTTP Password
								</label>
								<div className="relative">
									<Input
										id="httpPassword"
										name="httpPassword"
										type={showPassword ? "text" : "password"}
										defaultValue={config.vlc.httpPassword}
										placeholder={config.vlc.httpPassword ? "••••••••" : "No password set"}
										className="focus-discord pr-10"
									/>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
										onClick={() => setShowPassword(!showPassword)}
										aria-label={showPassword ? "Hide password" : "Show password"}
									>
										{showPassword ? (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="16"
												height="16"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<title>{showPassword ? "Hide password" : "Show password"}</title>
												<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
												<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
												<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
												<line x1="2" x2="22" y1="2" y2="22" />
											</svg>
										) : (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												width="16"
												height="16"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<title>{showPassword ? "Hide password" : "Show password"}</title>
												<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
												<circle cx="12" cy="12" r="3" />
											</svg>
										)}
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Password for VLC HTTP interface. Leave empty to generate a random password.
								</p>
							</div>

							<div className="flex items-center justify-between bg-background p-3 rounded-md">
								<div>
									<label className="text-sm font-medium text-card-foreground" htmlFor="httpEnabled">
										Enable HTTP Interface
									</label>
									<p className="text-xs text-muted-foreground">
										Required for Discord Rich Presence to work
									</p>
								</div>
								<Switch
									id="httpEnabled"
									name="httpEnabled"
									defaultChecked={config.vlc.httpEnabled}
								/>
							</div>

							<Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
								Save VLC Configuration
							</Button>
						</form>
					</div>
				</section>

				<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
					<div className="border-b border-border px-4 py-3">
						<h2 className="font-semibold">Application Settings</h2>
					</div>
					<div className="p-4 space-y-4">
						<div className="flex items-center justify-between bg-background p-3 rounded-md">
							<div>
								<p className="text-sm font-medium text-card-foreground">Minimize to Tray</p>
								<p className="text-xs text-muted-foreground">
									Keep the app running in the system tray when closed
								</p>
							</div>
							<Switch
								checked={config.minimizeToTray}
								onChange={() => handleToggleOption("minimizeToTray")}
							/>
						</div>

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

						<div className="space-y-2">
							<label className="text-sm font-medium text-card-foreground" htmlFor="clientId">
								Discord Client ID
							</label>
							<Input
								id="clientId"
								defaultValue={config.clientId}
								onBlur={(e) => saveConfig("clientId", e.target.value)}
								className="focus-discord"
							/>
							<p className="text-xs text-muted-foreground">
								Discord application client ID for Rich Presence
							</p>
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}
