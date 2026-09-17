import type {
	PresenceBadge,
	PresenceCardLiveProps,
	PresenceProgress,
} from "@renderer/components/presence-card"
import type { DiscordPresenceData } from "@shared/presence/presence.types"
import type { ActivityType } from "discord-api-types/v10"

// Read as wire numbers: discord-api-types is a transitive dependency of the RPC
// client and has no business in the renderer bundle.
const LISTENING: ActivityType = 2
const WATCHING: ActivityType = 3

/** Everything the card draws except the artwork, which is fetched separately. */
export type PresenceCardContent = Omit<PresenceCardLiveProps, "artworkUrl">

/**
 * One presence, read the way Discord reads it. The header carries the verb alone,
 * the name is the first body line, and `large_text` stays off the body entirely
 * because Discord only shows it on hover over the artwork.
 */
export function presenceContent(
	presence: DiscordPresenceData,
	pausedImage: string | undefined,
): PresenceCardContent {
	const content: PresenceCardContent = {
		kind: "presence",
		header: activityVerb(presence.activity_type),
		icon: presence.activity_type === WATCHING ? "video" : "music",
	}

	// Discord drops a line it was given no text for rather than drawing a blank one.
	if (presence.name) {
		content.name = presence.name
	}
	if (presence.details) {
		content.details = presence.details
	}
	if (presence.state) {
		content.state = presence.state
	}
	if (presence.large_text) {
		content.largeText = presence.large_text
	}

	const badge = presenceBadge(presence, pausedImage)
	if (badge) {
		content.badge = badge
	}

	const progress = presenceProgress(presence)
	if (progress) {
		content.progress = progress
	}

	return content
}

/**
 * Discord's own verb, and nothing else. The name that follows it on a Discord
 * profile is a body line, not part of this, so folding one into the other would
 * name the activity twice for audio and lose the bold line for video.
 */
export function activityVerb(activityType: ActivityType | undefined): string {
	if (activityType === WATCHING) {
		return "Watching"
	}
	if (activityType === LISTENING) {
		return "Listening"
	}
	return "Playing"
}

/**
 * The small image crosses as a Discord asset key, never a URL, so it is read back
 * against the key the loop picks for a paused file rather than fetched.
 */
export function presenceBadge(
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

/**
 * The timestamps are absolute wall clock seconds, and Discord draws the bar from
 * them against the viewer's own clock, so this reads them the same way. Paused
 * playback carries no timestamps at all, which is why there is no bar to pause.
 */
export function presenceProgress(presence: DiscordPresenceData): PresenceProgress | null {
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
