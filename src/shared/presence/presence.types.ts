import type { ActivityType } from "discord-api-types/v10"
/**
 * Discord presence update data
 */
export interface DiscordPresenceData {
	details?: string
	state?: string
	start_timestamp?: number
	end_timestamp?: number
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
