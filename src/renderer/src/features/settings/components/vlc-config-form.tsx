import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { Panel, Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { saveVlcConfig } from "@renderer/features/vlc"
import { logger } from "@renderer/lib/utils"
import type { VlcConfig } from "@shared/config/app-config"
import { useState } from "react"

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed" }

interface VlcConfigFormProps {
	initialConfig: VlcConfig
}

export function VlcConfigForm({ initialConfig }: VlcConfigFormProps): JSX.Element {
	const [save, setSave] = useState<SaveState>({ kind: "idle" })
	const [showPassword, setShowPassword] = useState(false)

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setSave({ kind: "saving" })

		try {
			const formData = new FormData(event.currentTarget)

			const vlcConfig: VlcConfig = {
				httpPort: Number(formData.get("httpPort")),
				httpPassword: formData.get("httpPassword") as string,
				httpEnabled: Boolean(formData.get("httpEnabled")),
			}

			const saved = await saveVlcConfig(vlcConfig)
			setSave(saved ? { kind: "saved" } : { kind: "failed" })
		} catch (error) {
			logger.error(`Failed to update the VLC configuration: ${error}`)
			setSave({ kind: "failed" })
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<Panel label="VLC">
				<Row
					htmlFor="httpPort"
					label="Port"
					description="VLC listens on this port. 9080 unless you changed it."
					control={
						<Input
							id="httpPort"
							name="httpPort"
							type="number"
							defaultValue={initialConfig.httpPort}
							min={1}
							max={65535}
							className="w-24 tabular-nums"
						/>
					}
				/>

				<Row
					htmlFor="httpPassword"
					label="Password"
					description="The app sends this to read VLC. Leave it empty to have one generated."
					control={
						<div className="relative w-56">
							<Input
								id="httpPassword"
								name="httpPassword"
								type={showPassword ? "text" : "password"}
								defaultValue={initialConfig.httpPassword}
								placeholder="Not set"
								className="pe-10"
							/>
							<Button
								variant="ghost"
								size="icon"
								className="absolute end-1 top-1"
								onClick={() => setShowPassword(!showPassword)}
								aria-label={showPassword ? "Hide the password" : "Show the password"}
							>
								{showPassword ? <EyeOffGlyph /> : <EyeGlyph />}
							</Button>
						</div>
					}
				/>

				<Row
					htmlFor="httpEnabled"
					label="Let this app read VLC over HTTP"
					description="Discord Rich Presence needs this on."
					control={
						<Switch
							id="httpEnabled"
							name="httpEnabled"
							defaultChecked={initialConfig.httpEnabled}
						/>
					}
				/>

				<div className="flex items-center justify-end gap-4 px-4 py-3">
					{save.kind === "saved" && (
						<p className="type-caption text-pretty text-muted-foreground">
							Saved. The app is reading VLC.
						</p>
					)}
					{save.kind === "failed" && (
						<p className="type-caption text-pretty text-danger-text">
							Could not reach VLC with these settings. Check the port and the password.
						</p>
					)}
					<Button type="submit" isLoading={save.kind === "saving"}>
						Save
					</Button>
				</div>
			</Panel>
		</form>
	)
}

function EyeGlyph(): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	)
}

function EyeOffGlyph(): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
			<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
			<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
			<line x1="2" x2="22" y1="2" y2="22" />
		</svg>
	)
}
