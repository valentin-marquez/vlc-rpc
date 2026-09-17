import { useStore } from "@nanostores/react"
import { PresenceCard, type PresenceCardLiveProps } from "@renderer/components/presence-card"
import { configStore } from "@renderer/stores/config.store"
import type { PresenceClearReason } from "@shared/presence/presence.types"

import { useLastPresence } from "../hooks/use-last-presence"
import { usePresenceArtwork } from "../hooks/use-presence-artwork"
import { presenceContent } from "../presence.mapper"

// Four different facts, and the user acts on each of them differently, so they
// are never folded into one empty state.
const CLEARED_BECAUSE: Record<PresenceClearReason, string> = {
	"rpc-disabled": "Rich Presence is turned off",
	"vlc-unavailable": "VLC is not reachable",
	"playback-stopped": "VLC has nothing playing",
	"loop-stopped": "Presence updates are stopped",
}

/**
 * What Discord shows, as the main process reports having sent it rather than as
 * this screen would have guessed. The three answers share one shell, so the page
 * does not jump when the activity clears.
 */
export function NowPlaying(): JSX.Element {
	const lastPresence = useLastPresence()
	const config = useStore(configStore)
	const artworkUrl = usePresenceArtwork(
		lastPresence.kind === "sent" ? lastPresence.presence.large_image : undefined,
	)

	if (lastPresence.kind === "unknown") {
		return (
			<PresenceCard kind="empty" header="No activity yet" message="Waiting for the first update" />
		)
	}

	if (lastPresence.kind === "cleared") {
		return (
			<PresenceCard
				kind="empty"
				header="No activity"
				message={CLEARED_BECAUSE[lastPresence.reason]}
			/>
		)
	}

	const card: PresenceCardLiveProps = {
		...presenceContent(lastPresence.presence, config?.pausedImage, lastPresence.applicationName),
		artworkUrl,
	}

	return <PresenceCard {...card} />
}
