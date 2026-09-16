import { Panel, Row } from "@renderer/components/ui/panel"
import type { SystemInfo } from "../system-info"

interface AboutPanelProps {
	info: SystemInfo
}

const INSTALL_LABEL: Record<"portable" | "setup", string> = {
	portable: "Portable",
	setup: "Installer",
}

export function AboutPanel({ info }: AboutPanelProps): JSX.Element {
	let version = "Not available"
	let installedAs = "Not available"

	if (info.kind === "loading") {
		version = "Loading"
		installedAs = "Loading"
	} else if (info.kind === "ready") {
		version = info.version
		installedAs = INSTALL_LABEL[info.installedAs]
	}

	return (
		<Panel label="About">
			<Row kind="value" label="Version" value={version} />
			<Row kind="value" label="Installed as" value={installedAs} />
		</Panel>
	)
}
