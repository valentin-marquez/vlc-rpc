import { useStore } from "@nanostores/react"
import { refreshMediaInfo } from "@renderer/features/media"
import { NowPlaying } from "@renderer/features/media/components/now-playing"
import {
	checkVlcConnection,
	refreshVlcStatus,
	repairVlcConfig,
	vlcConnectionReasonStore,
	vlcErrorStore,
	vlcStatusStore,
} from "@renderer/features/vlc"
import { useState } from "react"
import { ConnectionStatus } from "./components/connection-status"

export function HomePage(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const vlcError = useStore(vlcErrorStore)
	const vlcConnectionReason = useStore(vlcConnectionReasonStore)
	const [isRepairing, setIsRepairing] = useState(false)

	async function handleRepair(): Promise<void> {
		setIsRepairing(true)
		try {
			await repairVlcConfig()
			await checkVlcConnection()
		} finally {
			setIsRepairing(false)
		}
	}

	return (
		<div className="max-w-3xl mx-auto">
			{vlcStatus !== "connected" && vlcStatus !== "connecting" && vlcError && (
				<div className="mb-6 bg-destructive/10 text-destructive p-4 rounded-md">
					<h3 className="font-semibold mb-1">
						{vlcConnectionReason === "not-configured" ? "VLC is not set up" : "Connection Error"}
					</h3>
					<p className="text-sm">{vlcError}</p>
					{vlcConnectionReason === "not-configured" && (
						<button
							type="button"
							onClick={handleRepair}
							disabled={isRepairing}
							className="mt-3 px-3 py-1 text-xs bg-destructive/20 hover:bg-destructive/30 rounded-md disabled:opacity-50"
						>
							{isRepairing ? "Fixing..." : "Fix configuration"}
						</button>
					)}
				</div>
			)}

			<ConnectionStatus />

			<div>
				<div className="flex justify-between items-center mb-2">
					<h2 className="text-xl font-semibold">Now Playing</h2>
					{vlcStatus === "connected" && (
						<button
							type="button"
							onClick={async () => {
								await refreshVlcStatus()
								await refreshMediaInfo()
							}}
							className="px-3 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20"
						>
							Refresh
						</button>
					)}
				</div>
				<NowPlaying />
			</div>
		</div>
	)
}
