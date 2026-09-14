import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Switch } from "@renderer/components/ui/switch"
import { saveVlcConfig } from "@renderer/features/vlc"
import { logger } from "@renderer/lib/utils"
import type { VlcConfig } from "@shared/config/app-config"
import { useState } from "react"

interface VlcConfigFormProps {
	initialConfig: VlcConfig
}

export function VlcConfigForm({ initialConfig }: VlcConfigFormProps): JSX.Element {
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showPassword, setShowPassword] = useState(false)

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setIsSubmitting(true)

		try {
			const formData = new FormData(event.currentTarget)

			const vlcConfig: VlcConfig = {
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

	return (
		<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
			<div className="border-b border-border px-4 py-3">
				<h2 className="font-semibold">VLC Configuration</h2>
			</div>
			<div className="p-4">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm font-medium text-card-foreground" htmlFor="httpPort">
							HTTP Port
						</label>
						<Input
							id="httpPort"
							name="httpPort"
							type="number"
							defaultValue={initialConfig.httpPort}
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
								defaultValue={initialConfig.httpPassword}
								placeholder={initialConfig.httpPassword ? "••••••••" : "No password set"}
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
										<title>Hide password</title>
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
										<title>Show password</title>
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
							defaultChecked={initialConfig.httpEnabled}
						/>
					</div>

					<Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
						Save VLC Configuration
					</Button>
				</form>
			</div>
		</section>
	)
}
