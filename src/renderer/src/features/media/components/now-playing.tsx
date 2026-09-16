import { useStore } from "@nanostores/react"
import { PresenceCard, type PresenceCardLiveProps } from "@renderer/components/presence-card"
import { vlcStatusStore } from "@renderer/features/vlc"
import { configStore } from "@renderer/stores/config.store"

import { useProxiedArtwork } from "../hooks/use-proxied-artwork"
import { mediaStore } from "../media.store"
import { layoutFromConfig, presenceLines } from "../presence-lines"

/**
 * What Discord shows, drawn the way Discord draws it. The empty and the live
 * card are the same shell at the same height, so the page never jumps when
 * playback stops.
 */
export function NowPlaying(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const media = useStore(mediaStore)
	const config = useStore(configStore)
	const artworkUrl = useProxiedArtwork()

	if (vlcStatus !== "connected") {
		return (
			<PresenceCard
				kind="empty"
				message={vlcStatus === "connecting" ? "Checking VLC" : "VLC is not connected"}
			/>
		)
	}

	if (!media.title) {
		return <PresenceCard kind="empty" />
	}

	const lines = presenceLines(media, layoutFromConfig(config))

	const card: PresenceCardLiveProps = {
		kind: "presence",
		header: lines.header,
		details: lines.details,
		state: lines.state,
		largeText: lines.largeText,
		artworkUrl,
	}

	if (media.duration) {
		card.progress = {
			elapsedSeconds: media.position ?? 0,
			durationSeconds: media.duration,
			paused: media.mediaStatus === "paused",
		}
	}

	return <PresenceCard {...card} />
}
