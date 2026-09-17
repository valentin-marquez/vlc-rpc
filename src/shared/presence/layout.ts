/**
 * How a media file is laid out on a Discord profile. The presence loop renders these
 * lines and the Layout screen previews them, so both read the templates from here and
 * a preview cannot promise something the profile will not show.
 */

export type TemplateVariables = Record<string, string | number | undefined>

/**
 * Candidates in priority order. The first one whose variables all carry a value wins,
 * which is how one preset covers a series episode and a film with no episode at all.
 */
export type LayoutLine = readonly string[]

export interface MusicLayout {
	/** What follows "Listening to" on the profile. */
	activityName: LayoutLine
	details: LayoutLine
	state: LayoutLine
}

export interface VideoLayout {
	details: LayoutLine
	state: LayoutLine
}

export interface ResolvedLayout {
	music: MusicLayout
	video: VideoLayout
}

export type MusicPreset = "default" | "album-focused" | "artist-spotlight"

export type VideoPreset = "default" | "one-line" | "title-only"

export const MUSIC_PRESETS: Record<MusicPreset, MusicLayout> = {
	default: {
		activityName: ["{artist}", "VLC"],
		details: ["{title}"],
		state: ["by {artist}"],
	},
	"album-focused": {
		activityName: ["{album}", "{artist}", "VLC"],
		details: ["{album}"],
		state: ["{title} by {artist}", "{title}"],
	},
	"artist-spotlight": {
		activityName: ["{title}", "VLC"],
		details: ["{artist}"],
		state: ["{title}"],
	},
}

export const VIDEO_PRESETS: Record<VideoPreset, VideoLayout> = {
	default: {
		details: ["{title}"],
		state: ["{episodeInfo}", "{year}"],
	},
	"one-line": {
		details: ["{title} {episodeInfo}", "{title} ({year})", "{title}"],
		state: [],
	},
	"title-only": {
		details: ["{title}"],
		state: [],
	},
}

export const DEFAULT_MUSIC_PRESET: MusicPreset = "default"
export const DEFAULT_VIDEO_PRESET: VideoPreset = "default"

export interface LayoutChoice {
	music?: MusicPreset | undefined
	video?: VideoPreset | undefined
}

/**
 * The two choices are the whole of the stored state. Composing the layout on every read
 * is what keeps a preset and the lines it stands for from ever disagreeing.
 */
export function resolveLayout(choice: LayoutChoice): ResolvedLayout {
	return {
		music: pick(MUSIC_PRESETS, choice.music, DEFAULT_MUSIC_PRESET),
		video: pick(VIDEO_PRESETS, choice.video, DEFAULT_VIDEO_PRESET),
	}
}

// A hand edited config can name a preset that no release ever shipped.
function pick<K extends string, V>(presets: Record<K, V>, name: K | undefined, fallback: K): V {
	if (name !== undefined && Object.hasOwn(presets, name)) {
		return presets[name]
	}
	return presets[fallback]
}

export interface VideoFacts {
	title: string
	season?: number | undefined
	episode?: number | undefined
	year?: string | number | undefined
}

export function videoVariables(facts: VideoFacts): TemplateVariables {
	return {
		title: facts.title,
		episodeInfo: episodeMarker(facts.season, facts.episode),
		season: facts.season,
		episode: facts.episode,
		year: facts.year,
	}
}

function episodeMarker(season: number | undefined, episode: number | undefined): string {
	if (season !== undefined && episode !== undefined) return `S${season}E${episode}`
	if (season !== undefined) return `Season ${season}`
	if (episode !== undefined) return `Episode ${episode}`
	return ""
}

const PLACEHOLDER = /\{([^{}]+)\}/g
const WHITESPACE_RUN = /\s+/g

/**
 * A template is all or nothing: one missing value drops the whole candidate. Filling the
 * gap instead is what used to write "Unknown" onto a profile, and dropping only the
 * placeholder would leave its literal text behind, as in "by " with no artist.
 */
export function applyTemplate(template: string, variables: TemplateVariables): string {
	let complete = true

	const rendered = template.replace(PLACEHOLDER, (_placeholder, name: string) => {
		const value = variables[name]
		const text = value === undefined ? "" : String(value).trim()
		if (text === "") {
			complete = false
		}
		return text
	})

	if (!complete) return ""

	return rendered.replace(WHITESPACE_RUN, " ").trim()
}

export function renderLine(line: LayoutLine, variables: TemplateVariables): string {
	for (const candidate of line) {
		const rendered = applyTemplate(candidate, variables)
		if (rendered !== "") return rendered
	}
	return ""
}

/**
 * The variables a music template may use, for the screen that lists them.
 */
export const MUSIC_TEMPLATE_VARS = {
	title: "Song title",
	artist: "Artist name",
	album: "Album name",
}

/**
 * The variables a video template may use, for the screen that lists them.
 */
export const VIDEO_TEMPLATE_VARS = {
	title: "Show or film title",
	episodeInfo: "Episode marker (S2E5, Season 2 or Episode 5), empty for a film",
	year: "Release year",
	season: "Season number",
	episode: "Episode number",
}
