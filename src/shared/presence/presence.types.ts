import type { ActivityType } from "discord-api-types/v10"
export interface DiscordPresenceData {
	details?: string
	state?: string
	start_timestamp?: number | undefined
	end_timestamp?: number | undefined
	large_image?: string
	large_text?: string
	small_image?: string
	small_text?: string
	party_id?: string
	party_size?: [number, number]
	join?: string
	spectate?: string
	match?: string
	buttons?: Array<{ label: string; url: string }>
	instance?: boolean
	activity_type?: ActivityType
	name?: string
}

/**
 * Why nothing is on Discord right now. The loop knows the answer at the moment
 * it decides to clear, and it is the one thing the renderer cannot work out by
 * looking at VLC: an empty activity looks the same from the outside whether the
 * user hid it, VLC went away, or playback stopped.
 */
export type PresenceClearReason =
	| "rpc-disabled"
	| "vlc-unavailable"
	| "playback-stopped"
	| "loop-stopped"

/**
 * The presence the app last handed to Discord, reported rather than rebuilt so
 * the renderer cannot drift from what Discord is actually showing.
 *
 * `unknown` and `cleared` are different answers: the first says no verdict has
 * been reached yet, the second says the activity is deliberately empty.
 */
export type LastSentPresence =
	| { kind: "unknown" }
	| { kind: "cleared"; reason: PresenceClearReason }
	| {
			kind: "sent"
			presence: DiscordPresenceData
			sentAt: number
			/**
			 * What Discord calls this application, as Discord itself answered. It is the
			 * name on the header line whenever the presence carries none of its own, and
			 * nothing else in the app can work it out, so a preview that guessed it would
			 * be guessing the one line every profile shows.
			 */
			applicationName: string | null
	  }
