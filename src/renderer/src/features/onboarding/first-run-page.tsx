import logo from "@renderer/assets/logo.png"
import { loadVlcConfig, saveVlcConfig } from "@renderer/features/vlc"
import { cn, logger } from "@renderer/lib/utils"
import { saveFullConfig } from "@renderer/stores/config.store"
import type { VlcConfig } from "@shared/config/app-config"
import { useState } from "react"
import { SetupCompleteStep } from "./components/setup-complete-step"
import { VlcSetupStep } from "./components/vlc-setup-step"
import { WelcomeStep } from "./components/welcome-step"

type Step = "welcome" | "vlc" | "done"

const STEPS: readonly Step[] = ["welcome", "vlc", "done"]

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
				setErrorMessage(null)
				setCurrentStep("done")
			} else {
				setConnectionStatus("error")
				setErrorMessage("Could not configure VLC. Check that VLC is installed and closed.")
			}
		} catch (error) {
			logger.error(`Error during VLC configuration: ${error}`)
			setConnectionStatus("error")
			setErrorMessage("Something went wrong while configuring VLC.")
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
			setErrorMessage("Could not save your setup.")
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<main className="scroll-region grid h-full place-items-center bg-canvas p-6 text-body">
			<div className="w-full max-w-[480px]">
				<div className="mb-8 flex flex-col items-center">
					<img src={logo} alt="" className="mb-3 size-20" />
					<h1 className="type-hero text-strong">VLC Discord RP</h1>
				</div>

				<div className="relative overflow-hidden rounded-lg border border-divider bg-card p-6 shadow-[0_8px_32px_rgb(0_0_0/0.5)]">
					<StepIndicator steps={STEPS} currentIndex={STEPS.indexOf(currentStep)} />

					<div
						key={currentStep}
						className={cn(
							"onboarding-step opacity-100 [transform:translateX(0)]",
							"starting:opacity-0 starting:[transform:translateX(8px)]",
							"[transition:opacity_var(--spring-enter-duration)_var(--spring-enter),transform_var(--spring-enter-duration)_var(--spring-enter)]",
						)}
					>
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

						{currentStep === "done" && (
							<SetupCompleteStep
								onBack={() => setCurrentStep("vlc")}
								onFinish={finishSetup}
								isLoading={isLoading}
							/>
						)}
					</div>
				</div>
			</div>
		</main>
	)
}

interface StepIndicatorProps {
	steps: readonly Step[]
	currentIndex: number
}

// The line sits on the card's top edge so the indicator costs the layout no height.
function StepIndicator({ steps, currentIndex }: StepIndicatorProps): JSX.Element {
	return (
		<>
			<p className="sr-only">{`Step ${currentIndex + 1} of ${steps.length}`}</p>
			<div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-[2px] gap-1">
				{steps.map((step, index) => (
					<span
						key={step}
						className={cn("flex-1", index <= currentIndex ? "bg-brand" : "bg-raised")}
					/>
				))}
			</div>
		</>
	)
}
