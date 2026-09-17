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
 * One presence, read the way Discord draws it.
 *
 * Measured on a profile playing a file with no album: the app sent name "Probablemente",
 * details "by Christian Nodal", state "" and large_text "Listening to Music", and Discord
 * drew "Escuchando Probablemente" as the header, "by Christian Nodal" in bold under it,
 * then "Listening to Music". So the verb and the name share the header line, `details` is
 * the bold line below it, `state` the next one and `large_text` the last, and a field with
 * no text is left out while the ones under it move up. It is the shape of a Spotify card.
 *
 * `applicationName` is the header's other half: a presence that carries no name of its own
 * is named after the application, and only Discord knows that name.
 */
export function presenceContent(
	presence: DiscordPresenceData,
	pausedImage: string | undefined,
	applicationName: string | null,
): PresenceCardContent {
	const content: PresenceCardContent = {
		kind: "presence",
		header: activityHeader(activityVerb(presence.activity_type), presence.name ?? applicationName),
		icon: presence.activity_type === WATCHING ? "video" : "music",
	}

	// Discord drops a line it was given no text for rather than drawing a blank one.
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

/** The word Discord opens the header with, before the name of the activity. */
export type ActivityVerb = "Listening" | "Watching" | "Playing"

export function activityVerb(activityType: ActivityType | undefined): ActivityVerb {
	if (activityType === WATCHING) {
		return "Watching"
	}
	if (activityType === LISTENING) {
		return "Listening"
	}
	return "Playing"
}

/** What the header reads before the name: "Listening to", "Watching", "Playing". */
export function headerPrefix(verb: ActivityVerb): string {
	return verb === "Listening" ? `${verb} to` : verb
}

/**
 * The header Discord draws: the verb and the activity's name, on one line. Nothing is
 * written after the verb when the name is unknown, because the name Discord falls back to
 * belongs to Discord and inventing one here is how the preview came to disagree with the
 * profile in the first place.
 */
export function activityHeader(verb: ActivityVerb, name: string | null | undefined): string {
	if (name === null || name === undefined || name === "") {
		return verb
	}

	return `${headerPrefix(verb)} ${name}`
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
