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
			<h2 className="type-hero text-strong">VLC is configured</h2>

			<div className="flex gap-3 rounded-md bg-ok/14 p-4">
				<CheckCircledIcon aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-ok-text" />
				<div className="space-y-1">
					<p className="type-label text-ok-text">The HTTP interface is on</p>
					<p className="type-body text-body">
						Play a file in VLC to check that Discord picks it up.
					</p>
				</div>
			</div>

			<p className="type-caption text-muted-foreground">Restart VLC if it was already running.</p>

			<div className="flex justify-end gap-2 pt-4">
				<Button variant="secondary" onClick={onBack} disabled={isLoading}>
					Back
				</Button>
				<Button onClick={onFinish} isLoading={isLoading}>
					Finish setup
				</Button>
			</div>
		</div>
	)
}
