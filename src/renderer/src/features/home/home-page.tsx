import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { NowPlaying } from "@renderer/features/media/components/now-playing"
import { SourcePanel } from "@renderer/features/media/components/source-panel"
import {
	checkVlcConnection,
	repairVlcConfig,
	vlcConnectionReasonStore,
	vlcErrorStore,
	vlcStatusStore,
} from "@renderer/features/vlc"
import { useState } from "react"

import { VlcBanner } from "./components/vlc-banner"

/**
 * Two blocks: what Discord shows, then what VLC reports. Connection state is not
 * one of them, it lives in the header chips on every screen.
 */
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

	// Connecting is a state the chips already narrate, so it raises no banner.
	const failed = vlcStatus !== "connected" && vlcStatus !== "connecting" && vlcError !== null
	const notConfigured = vlcConnectionReason === "not-configured"

	return (
		<div className="flex flex-col gap-6">
			{failed && (
				<VlcBanner
					title={notConfigured ? "VLC is not set up" : "Cannot reach VLC"}
					body={vlcError}
					action={
						notConfigured ? (
							<Button
								size="sm"
								variant="secondary"
								isLoading={isRepairing}
								onClick={() => {
									void handleRepair()
								}}
							>
								Fix the VLC setup
							</Button>
						) : undefined
					}
				/>
			)}

			<NowPlaying />
			<SourcePanel />
		</div>
	)
}
