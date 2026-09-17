import { useStore } from "@nanostores/react"
import {
	type PresenceBadge,
	PresenceCard,
	type PresenceCardLiveProps,
	type PresenceProgress,
} from "@renderer/components/presence-card"
import { configStore } from "@renderer/stores/config.store"
import type { DiscordPresenceData, PresenceClearReason } from "@shared/presence/presence.types"
import type { ActivityType } from "discord-api-types/v10"

import { useLastPresence } from "../hooks/use-last-presence"
import { usePresenceArtwork } from "../hooks/use-presence-artwork"

// Read as wire numbers: discord-api-types is a transitive dependency of the RPC
// client and has no business in the renderer bundle.
const LISTENING: ActivityType = 2
const WATCHING: ActivityType = 3

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

	const { presence } = lastPresence

	const card: PresenceCardLiveProps = {
		kind: "presence",
		header: presenceHeader(presence),
		details: presence.details ?? "",
		artworkUrl,
	}

	if (presence.state) {
		card.state = presence.state
	}
	if (presence.large_text) {
		card.largeText = presence.large_text
	}

	const badge = presenceBadge(presence, config?.pausedImage)
	if (badge) {
		card.badge = badge
	}

	const progress = presenceProgress(presence)
	if (progress) {
		card.progress = progress
	}

	return <PresenceCard {...card} />
}

/**
 * The small image crosses as a Discord asset key, never a URL, so it is read back
 * against the key the loop picks for a paused file rather than fetched.
 */
function presenceBadge(
	presence: DiscordPresenceData,
	pausedImage: string | undefined,
): PresenceBadge | null {
	if (presence.small_image === undefined) {
		return null
	}

	return {
		kind: presence.small_image === pausedImage ? "paused" : "playing",
		text: presence.small_text,
	}
}

/** Discord's own verbs. An absent name falls back to the application's own. */
function presenceHeader(presence: DiscordPresenceData): string {
	if (presence.activity_type === WATCHING) {
		return "Watching"
	}
	if (presence.activity_type === LISTENING) {
		return `Listening to ${presence.name ?? "VLC"}`
	}
	return `Playing ${presence.name ?? "VLC"}`
}

/**
 * The timestamps are absolute wall clock seconds, and Discord draws the bar from
 * them against the viewer's own clock, so this reads them the same way. `sentAt`
 * is epoch milliseconds and takes no part in the arithmetic. Paused playback
 * carries no timestamps at all, which is why there is no bar to pause.
 */
function presenceProgress(presence: DiscordPresenceData): PresenceProgress | null {
	const start = presence.start_timestamp
	const end = presence.end_timestamp

	if (start === undefined || end === undefined || end <= start) {
		return null
	}

	const durationSeconds = end - start
	const elapsed = Date.now() / 1000 - start

	return {
		elapsedSeconds: Math.min(Math.max(elapsed, 0), durationSeconds),
		durationSeconds,
	}
}
