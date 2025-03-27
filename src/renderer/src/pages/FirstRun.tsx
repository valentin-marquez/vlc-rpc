import { CheckCircledIcon, CrossCircledIcon, InfoCircledIcon } from "@radix-ui/react-icons"
import logo from "@renderer/assets/logo.png"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Switch } from "@renderer/components/ui/switch"
import { logger } from "@renderer/lib/utils"
import { saveFullConfig } from "@renderer/stores/config"
import { loadVlcConfig, saveVlcConfig } from "@renderer/stores/vlc"
import type { VlcConfig } from "@shared/types"
import { useState } from "react"

type Step = "welcome" | "vlc" | "testing" | "success"

export function FirstRun(): JSX.Element {
	const [currentStep, setCurrentStep] = useState<Step>("welcome")
	const [isLoading, setIsLoading] = useState(false)
	const [vlcConfig, setVlcConfig] = useState<VlcConfig>({
		httpPort: 9080,
		httpPassword: "",
		httpEnabled: true,
	})
	const [connectionStatus, setConnectionStatus] = useState<
		"idle" | "testing" | "success" | "error"
	>("idle")
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	async function handleVlcConfig() {
		setIsLoading(true)
		setConnectionStatus("testing")

		try {
			// Try to load existing VLC config first
			await loadVlcConfig()

			// Now save the config (with HTTP interface enabled)
			const updatedConfig = await saveVlcConfig({
				...vlcConfig,
				httpEnabled: true,
			})

			if (updatedConfig) {
				// Update local state with the updated config from the backend
				setVlcConfig(updatedConfig)
				setConnectionStatus("success")
				setCurrentStep("testing")
			} else {
				setConnectionStatus("error")
				setErrorMessage(
					"Failed to configure VLC. Make sure VLC is installed and not currently running.",
				)
			}
		} catch (error) {
			logger.error(`Error during VLC configuration: ${error}`)
			setConnectionStatus("error")
			setErrorMessage("An unexpected error occurred while configuring VLC.")
		} finally {
			setIsLoading(false)
		}
	}

	async function finishSetup() {
		setIsLoading(true)

		try {
			// Mark first run as complete
			await saveFullConfig({
				isFirstRun: false,
				vlc: vlcConfig,
			})

			// Redirect to home page
			window.location.hash = "/"
		} catch (error) {
			logger.error(`Error completing setup: ${error}`)
			setErrorMessage("Failed to complete setup.")
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
			<div className="w-full max-w-md">
				<div className="mb-8 flex flex-col items-center justify-center">
					<div className="relative">
						<div className="absolute inset-0 blur-lg opacity-50 bg-primary/30 rounded-full scale-110" />
						<img src={logo} alt="VLC Discord RP" className="relative h-20 w-20 mb-3" />
					</div>
					<h1 className="text-3xl font-bold text-primary tracking-tight">VLC Discord RP</h1>
					<div className="h-1 w-16 bg-primary/30 rounded-full mt-3" />
				</div>

				<div className="bg-card text-card-foreground rounded-lg border border-border shadow-lg p-6">
					{currentStep === "welcome" && (
						<div className="space-y-4">
							<h2 className="text-2xl font-bold text-center">Welcome!</h2>
							<p className="text-center text-muted-foreground">
								Let's set up VLC Discord Rich Presence so you can share what you're playing.
							</p>

							<div className="bg-muted text-muted-foreground p-4 rounded-md">
								<div className="flex">
									<InfoCircledIcon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
									<div className="ml-2">
										<p className="text-sm text-card-foreground">
											This app works by connecting to VLC's HTTP interface to get information about
											what you're playing.
										</p>
										<p className="text-sm mt-2 text-card-foreground">
											We'll need to configure VLC to enable this feature.
										</p>
									</div>
								</div>
							</div>

							<div className="pt-4">
								<Button
									onClick={() => setCurrentStep("vlc")}
									className="w-full cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
								>
									Let's get started
								</Button>
							</div>
						</div>
					)}

					{currentStep === "vlc" && (
						<div className="space-y-4">
							<h2 className="text-xl font-bold">Configure VLC</h2>
							<p className="text-sm text-muted-foreground">
								We need to set up VLC's HTTP interface. This allows the app to see what you're
								playing.
							</p>

							<div className="space-y-4">
								<div className="space-y-2">
									<label className="text-sm font-medium text-card-foreground" htmlFor="httpPort">
										HTTP Port
									</label>
									<Input
										id="httpPort"
										type="number"
										value={vlcConfig.httpPort}
										onChange={(e) =>
											setVlcConfig({
												...vlcConfig,
												httpPort: Number(e.target.value),
											})
										}
										min="1000"
										max="65535"
										className="focus-discord"
									/>
									<p className="text-xs text-muted-foreground">
										Port for VLC's HTTP interface (default: 9080)
									</p>
								</div>

								<div className="space-y-2">
									<label
										className="text-sm font-medium text-card-foreground"
										htmlFor="httpPassword"
									>
										HTTP Password
									</label>
									<Input
										id="httpPassword"
										type="password"
										value={vlcConfig.httpPassword}
										onChange={(e) =>
											setVlcConfig({
												...vlcConfig,
												httpPassword: e.target.value,
											})
										}
										placeholder="Leave empty to generate a random password"
										className="focus-discord"
									/>
									<p className="text-xs text-muted-foreground">
										Password to protect VLC's HTTP interface. Leave empty to generate a random
										secure password.
									</p>
								</div>

								<div className="flex items-center justify-between p-3 bg-muted rounded-md">
									<div>
										<p className="text-sm font-medium text-card-foreground">
											Enable HTTP Interface
										</p>
										<p className="text-xs text-muted-foreground">
											Required for Discord Rich Presence
										</p>
									</div>
									<Switch
										checked={vlcConfig.httpEnabled}
										onChange={(event) =>
											setVlcConfig({
												...vlcConfig,
												httpEnabled: event.target.checked,
											})
										}
									/>
								</div>

								{errorMessage && (
									<div className="bg-destructive/10 p-3 rounded-md flex">
										<CrossCircledIcon className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
										<p className="text-sm text-destructive ml-2">{errorMessage}</p>
									</div>
								)}
							</div>

							<div className="pt-4 flex justify-between">
								<Button
									variant="outline"
									onClick={() => setCurrentStep("welcome")}
									disabled={isLoading}
								>
									Back
								</Button>
								<Button
									onClick={handleVlcConfig}
									isLoading={isLoading}
									disabled={!vlcConfig.httpEnabled}
									className="bg-primary hover:bg-primary/90 text-primary-foreground"
								>
									{connectionStatus === "error" ? "Try Again" : "Configure VLC"}
								</Button>
							</div>
						</div>
					)}

					{currentStep === "testing" && (
						<div className="space-y-4">
							<h2 className="text-xl font-bold text-card-foreground">VLC Configuration Complete</h2>

							<div className="bg-green-500/10 text-green-400 p-4 rounded-md">
								<div className="flex">
									<CheckCircledIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
									<div className="ml-2">
										<p className="text-sm">
											VLC has been successfully configured to work with Discord Rich Presence.
										</p>
										<p className="text-sm mt-2">
											Try playing a media file in VLC to test the connection.
										</p>
									</div>
								</div>
							</div>

							<div className="pt-2">
								<p className="text-sm text-muted-foreground">
									Note: You might need to restart VLC if it was already running.
								</p>
							</div>

							<div className="pt-4 flex justify-between">
								<Button
									variant="outline"
									onClick={() => setCurrentStep("vlc")}
									disabled={isLoading}
								>
									Back
								</Button>
								<Button
									onClick={finishSetup}
									isLoading={isLoading}
									className="bg-primary hover:bg-primary/90 text-primary-foreground"
								>
									Finish Setup
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
