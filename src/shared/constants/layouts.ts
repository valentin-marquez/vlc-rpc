import type { LayoutPreset, PresenceLayout } from "@shared/types"

/**
 * Predefined layout presets for Discord Rich Presence
 */
export const LAYOUT_PRESETS: Record<LayoutPreset, PresenceLayout> = {
	default: {
		activityName: "{artist}",
		musicDetails: "{title}",
		musicState: "by {artist}",
		videoDetails: "{title}",
		videoState: "{episodeInfo}",
	},
	"album-focused": {
		activityName: "{album}",
		musicDetails: "{album}",
		musicState: "{title} • {artist}",
		videoDetails: "{title}",
		videoState: "{episodeInfo}",
	},
	"artist-spotlight": {
		activityName: "{title}",
		musicDetails: "{artist}",
		musicState: "• {title}",
		videoDetails: "{title}",
		videoState: "{episodeInfo}",
	},
}

/**
 * Get the default layout
 */
export function getDefaultLayout(): PresenceLayout {
	return LAYOUT_PRESETS.default
}

/**
 * Get a layout by preset name
 */
export function getLayoutByPreset(preset: LayoutPreset): PresenceLayout {
	return LAYOUT_PRESETS[preset] || LAYOUT_PRESETS.default
}

/**
 * Available template variables for music
 */
export const MUSIC_TEMPLATE_VARS = {
	title: "Song title",
	artist: "Artist name",
	album: "Album name",
}

/**
 * Available template variables for video
 */
export const VIDEO_TEMPLATE_VARS = {
	title: "Video/Show/Movie title",
	episodeInfo: "Episode information (S01E02 or Season 1)",
	year: "Release year",
	season: "Season number",
	episode: "Episode number",
}

/**
 * Apply a template string with variable substitution
 */
export function applyTemplate(
	template: string,
	variables: Record<string, string | number | undefined>,
): string {
	let result = template

	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{${key}}`
		if (result.includes(placeholder)) {
			result = result.replace(new RegExp(placeholder, "g"), String(value || "Unknown"))
		}
	}

	// Clean up any remaining unfilled placeholders
	result = result.replace(/\{[^}]+\}/g, "")

	// Clean up extra spaces and separators
	result = result
		.replace(/\s*-\s*-\s*/g, " - ") // Multiple dashes
		.replace(/\s*•\s*•\s*/g, " • ") // Multiple bullets
		.replace(/\s+/g, " ") // Multiple spaces
		.replace(/^\s*[-•]\s*/, "") // Leading separators
		.replace(/\s*[-•]\s*$/, "") // Trailing separators
		.trim()

	return result || "Unknown"
}
