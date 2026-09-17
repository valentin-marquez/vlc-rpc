import type { PresenceBadge } from "@renderer/components/presence-card"
import type { MusicPreset, VideoFacts, VideoPreset } from "@shared/presence/layout"

export interface MusicCardData {
	preset: MusicPreset
	name: string
	description: string
}

export interface VideoCardData {
	preset: VideoPreset
	name: string
	description: string
}

/** A preset is only ever on a profile while something plays, so every preview says so. */
export const PLAYING_BADGE: PresenceBadge = { kind: "playing", text: "Playing" }

/** Stands in for the live track so every preset stays readable before VLC reports one. */
export const SAMPLE_TRACK = {
	title: "Bohemian Rhapsody",
	artist: "Queen",
	album: "A Night at the Opera",
}

/**
 * A video preset only earns its name if it reads well for both, so the card previews
 * an episode and a film side by side rather than picking one.
 */
export const SAMPLE_EPISODE: VideoFacts = { title: "Breaking Bad", season: 2, episode: 5 }
export const SAMPLE_FILM: VideoFacts = { title: "The Matrix", year: 1999 }

export const MUSIC_CARDS: MusicCardData[] = [
	{
		preset: "default",
		name: "Default",
		description: "Shows the song title first and the artist below it.",
	},
	{
		preset: "album-focused",
		name: "Album focus",
		description: "Shows the album first, with the song and artist below it.",
	},
	{
		preset: "artist-spotlight",
		name: "Artist spotlight",
		description: "Shows the artist first, with the song title below it.",
	},
]

export const VIDEO_CARDS: VideoCardData[] = [
	{
		preset: "default",
		name: "Default",
		description: "Shows the title first, with the episode or the release year below it.",
	},
	{
		preset: "one-line",
		name: "One line",
		description: "Puts the title and the episode together on a single line.",
	},
	{
		preset: "title-only",
		name: "Title only",
		description: "Shows the title alone, so the episode number stays off your profile.",
	},
]
