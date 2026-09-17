import { useStore } from "@nanostores/react"
import { configStore } from "@renderer/stores/config.store"
import { useEffect, useState } from "react"
import { AboutPanel } from "./components/about-panel"
import { AppSettingsPanel } from "./components/app-settings-panel"
import { OverridesPanel } from "./components/overrides-panel"
import { VlcConfigForm } from "./components/vlc-config-form"
import { type SystemInfo, readSystemInfo } from "./system-info"

export function SettingsPage(): JSX.Element {
	const config = useStore(configStore)
	const [system, setSystem] = useState<SystemInfo>({ kind: "loading" })

	useEffect(() => {
		let listening = true

		readSystemInfo().then((info) => {
			if (listening) {
				setSystem(info)
			}
		})

		return () => {
			listening = false
		}
	}, [])

	if (!config) {
		return <p className="type-body text-muted-foreground">Loading your settings</p>
	}

	return (
		<div className="flex flex-col gap-8">
			<h1 className="sr-only">Settings</h1>
			<AppSettingsPanel
				config={config}
				canStartWithSystem={system.kind === "ready" && !system.isPortable}
			/>
			<VlcConfigForm initialConfig={config.vlc} />
			<OverridesPanel />
			<AboutPanel info={system} />
		</div>
	)
}
