import { useStore } from "@nanostores/react"
import { configStore } from "@renderer/stores/config.store"
import { AppSettingsPanel } from "./components/app-settings-panel"
import { VlcConfigForm } from "./components/vlc-config-form"

export function SettingsPage(): JSX.Element {
	const config = useStore(configStore)

	if (!config) {
		return <div className="p-6 text-center text-foreground">Loading configuration...</div>
	}

	return (
		<div className="max-w-6xl mx-auto no-scrollbar">
			<div className="mb-6">
				<h1 className="text-2xl font-bold mb-1">Settings</h1>
				<p className="text-muted-foreground">Configure VLC Discord Rich Presence</p>
			</div>

			{/* items-start so each card keeps its own height instead of the
			    shorter one stretching to match its neighbour. */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
				<VlcConfigForm initialConfig={config.vlc} />
				<AppSettingsPanel config={config} />
			</div>
		</div>
	)
}
