import { CrossCircledIcon } from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Switch } from "@renderer/components/ui/switch"
import type { VlcConfig } from "@shared/config/app-config"
interface VlcSetupStepProps {
	vlcConfig: VlcConfig
	onVlcConfigChange: (config: VlcConfig) => void
	onBack: () => void
	onSubmit: () => void
	isLoading: boolean
	connectionStatus: "idle" | "testing" | "success" | "error"
	errorMessage: string | null
}

export function VlcSetupStep({
	vlcConfig,
	onVlcConfigChange,
	onBack,
	onSubmit,
	isLoading,
	connectionStatus,
	errorMessage,
}: VlcSetupStepProps): JSX.Element {
	return (
		<div className="space-y-4">
			<h2 className="text-xl font-bold">Configure VLC</h2>
			<p className="text-sm text-muted-foreground">
				We need to set up VLC's HTTP interface. This allows the app to see what you're playing.
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
							onVlcConfigChange({
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
					<label className="text-sm font-medium text-card-foreground" htmlFor="httpPassword">
						HTTP Password
					</label>
					<Input
						id="httpPassword"
						type="password"
						value={vlcConfig.httpPassword}
						onChange={(e) =>
							onVlcConfigChange({
								...vlcConfig,
								httpPassword: e.target.value,
							})
						}
						placeholder="Leave empty to generate a random password"
						className="focus-discord"
					/>
					<p className="text-xs text-muted-foreground">
						Password to protect VLC's HTTP interface. Leave empty to generate a random secure
						password.
					</p>
				</div>

				<div className="flex items-center justify-between p-3 bg-muted rounded-md">
					<div>
						<p className="text-sm font-medium text-card-foreground">Enable HTTP Interface</p>
						<p className="text-xs text-muted-foreground">Required for Discord Rich Presence</p>
					</div>
					<Switch
						checked={vlcConfig.httpEnabled}
						onChange={(event) =>
							onVlcConfigChange({
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
				<Button variant="secondary" onClick={onBack} disabled={isLoading}>
					Back
				</Button>
				<Button
					onClick={onSubmit}
					isLoading={isLoading}
					disabled={!vlcConfig.httpEnabled}
					className="bg-primary hover:bg-primary/90 text-primary-foreground"
				>
					{connectionStatus === "error" ? "Try Again" : "Configure VLC"}
				</Button>
			</div>
		</div>
	)
}
