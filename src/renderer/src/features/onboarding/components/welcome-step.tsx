import { InfoCircledIcon } from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"

interface WelcomeStepProps {
	onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps): JSX.Element {
	return (
		<div className="space-y-4">
			<h2 className="type-hero text-strong">Set up Rich Presence</h2>
			<p className="type-body text-muted-foreground">
				Two steps, and Discord shows what you play in VLC.
			</p>

			<div className="flex gap-3 rounded-md border border-divider bg-inset p-4">
				<InfoCircledIcon aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-brand" />
				<p className="type-body text-body">
					The app reads VLC's HTTP interface to see what is playing. The next step turns that
					interface on.
				</p>
			</div>

			<div className="flex justify-end gap-2 pt-4">
				<Button onClick={onNext}>Get started</Button>
			</div>
		</div>
	)
}
