import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { logger } from "@renderer/lib/utils"
import type { UpdateCheckResult } from "@shared/updates/update.types"
import { useState } from "react"
import type { SystemInfo } from "../system-info"

interface AboutPanelProps {
	info: SystemInfo
}

const INSTALL_LABEL: Record<"portable" | "setup", string> = {
	portable: "Portable",
	setup: "Installer",
}

/** Where the check the user asked for has got to. */
type CheckState =
	| { kind: "resting" }
	| { kind: "checking" }
	| { kind: "answered"; result: UpdateCheckResult }

/**
 * The answer belongs on the panel the press came from, which is why the check
 * reports here and opens nothing, a check that failed included. Taking a release
 * up stays the title bar's job, so there is no second install button here.
 */
function sentenceFor(state: CheckState): string {
	if (state.kind === "resting") return "The app looks for a release on its own every few hours."
	if (state.kind === "checking") return "Checking for updates."

	switch (state.result.kind) {
		case "found":
			return `Version ${state.result.version} is waiting on the button in the title bar.`
		case "up-to-date":
			return "You are up to date."
		case "busy":
			return "A check is already running."
		case "failed":
			return "The check could not reach GitHub. Check your connection, then try again."
	}
}

export function AboutPanel({ info }: AboutPanelProps): JSX.Element {
	const [check, setCheck] = useState<CheckState>({ kind: "resting" })

	let version = "Not available"
	let installedAs = "Not available"

	if (info.kind === "loading") {
		version = "Loading"
		installedAs = "Loading"
	} else if (info.kind === "ready") {
		version = info.version
		installedAs = INSTALL_LABEL[info.installedAs]
	}

	async function ask(): Promise<void> {
		setCheck({ kind: "checking" })

		try {
			setCheck({ kind: "answered", result: await window.api.update.check() })
		} catch (error) {
			logger.error(`Failed to ask for an update check: ${error}`)
			setCheck({ kind: "answered", result: { kind: "failed" } })
		}
	}

	return (
		<Panel label="About">
			<Row kind="value" label="Version" value={version} />
			<Row kind="value" label="Installed as" value={installedAs} />
			<Row
				kind="setting"
				label="Updates"
				description={<span aria-live="polite">{sentenceFor(check)}</span>}
				control={
					<Button
						variant="secondary"
						size="sm"
						isLoading={check.kind === "checking"}
						onClick={() => {
							void ask()
						}}
					>
						Check for updates
					</Button>
				}
			/>
		</Panel>
	)
}
