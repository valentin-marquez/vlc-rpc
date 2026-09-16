import { CheckCircledIcon } from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"

interface SetupCompleteStepProps {
	onBack: () => void
	onFinish: () => void
	isLoading: boolean
}

export function SetupCompleteStep({
	onBack,
	onFinish,
	isLoading,
}: SetupCompleteStepProps): JSX.Element {
	return (
		<div className="space-y-4">
			<h2 className="text-xl font-bold text-card-foreground">VLC Configuration Complete</h2>

			<div className="bg-green-500/10 text-green-400 p-4 rounded-md">
				<div className="flex">
					<CheckCircledIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
					<div className="ml-2">
						<p className="text-sm">
							VLC has been successfully configured to work with Discord Rich Presence.
						</p>
						<p className="text-sm mt-2">Try playing a media file in VLC to test the connection.</p>
					</div>
				</div>
			</div>

			<div className="pt-2">
				<p className="text-sm text-muted-foreground">
					Note: You might need to restart VLC if it was already running.
				</p>
			</div>

			<div className="pt-4 flex justify-between">
				<Button variant="secondary" onClick={onBack} disabled={isLoading}>
					Back
				</Button>
				<Button
					onClick={onFinish}
					isLoading={isLoading}
					className="bg-primary hover:bg-primary/90 text-primary-foreground"
				>
					Finish Setup
				</Button>
			</div>
		</div>
	)
}
