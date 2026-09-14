import logo from "@renderer/assets/logo.png"
import { loadVlcConfig, saveVlcConfig } from "@renderer/features/vlc"
import { logger } from "@renderer/lib/utils"
import { saveFullConfig } from "@renderer/stores/config.store"
import type { VlcConfig } from "@shared/config/app-config"
import { useState } from "react"
import { SetupCompleteStep } from "./components/setup-complete-step"
import { VlcSetupStep } from "./components/vlc-setup-step"
import { WelcomeStep } from "./components/welcome-step"

type Step = "welcome" | "vlc" | "testing" | "success"

export function FirstRunPage(): JSX.Element {
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

	async function handleVlcConfig(): Promise<void> {
		setIsLoading(true)
		setConnectionStatus("testing")

		try {
			await loadVlcConfig()

			const updatedConfig = await saveVlcConfig({
				...vlcConfig,
				httpEnabled: true,
			})

			if (updatedConfig) {
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

	async function finishSetup(): Promise<void> {
		setIsLoading(true)

		try {
			await saveFullConfig({
				isFirstRun: false,
				vlc: vlcConfig,
			})

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
					{currentStep === "welcome" && <WelcomeStep onNext={() => setCurrentStep("vlc")} />}

					{currentStep === "vlc" && (
						<VlcSetupStep
							vlcConfig={vlcConfig}
							onVlcConfigChange={setVlcConfig}
							onBack={() => setCurrentStep("welcome")}
							onSubmit={handleVlcConfig}
							isLoading={isLoading}
							connectionStatus={connectionStatus}
							errorMessage={errorMessage}
						/>
					)}

					{currentStep === "testing" && (
						<SetupCompleteStep
							onBack={() => setCurrentStep("vlc")}
							onFinish={finishSetup}
							isLoading={isLoading}
						/>
					)}
				</div>
			</div>
		</div>
	)
}
